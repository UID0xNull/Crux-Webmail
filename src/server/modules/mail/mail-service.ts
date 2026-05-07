// ============================================================================
// Crux-Webmail — MailService: Fachada unificada
// ============================================================================
// Punto único que orquesta ImapAdapter + SmtpAdapter vía ConnectionManager.
// Integra el motor MIME para parseo, sanitización y escaneo de contenido.
// Los controllers/routes NO importan protocolos — solo esta fachada.
// ============================================================================

import type {
  IMailMessage,
  IMailbox,
  ISearchResult,
  ISyncResponse,
  ISendResult,
  ICreateMessageInput,
  IAccountConfig,
  ISearchQuery,
  IFlags,
  IConnectionInfo,
} from './contracts';
import { MailConnectionManager, getMailConnectionManager, PoolInfo } from './connection-manager';
import { getImapExtensionsManager, ImapExtensionsManager, ServerProfile, ExtensionLevel } from './extensions/extensions-manager';
import { MimePipeline, ParsedEmail, MimePipelineConfig } from './mime';
import { CruxError } from '../errors/handler';
import { auditLogger } from '../utils/audit-logger';

// ------------------------------------------------------------------
// MailService — unified mail operations
// ------------------------------------------------------------------
export class MailService {
  private connectionManager: MailConnectionManager;
  private extensionsManager: ImapExtensionsManager;
  private mimePipeline: MimePipeline;

  constructor() {
    this.connectionManager = getMailConnectionManager();
    this.extensionsManager = getImapExtensionsManager();
    this.mimePipeline = new MimePipeline();
  }

  // ----------------------------------------------------------------
  // Connection lifecycle
  // ----------------------------------------------------------------
  async connectAccount(userId: string, config: IAccountConfig): Promise<ServerProfile> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    const info = imap.getConnectionInfo();
    const profile = this.extensionsManager.analyze(info.capabilities || [], config.accountId);

    auditLogger.info('MailService account connected', {
      actor_id: userId,
      metadata: {
        accountId: config.accountId,
        serverType: profile.serverType,
      },
    });

    return profile;
  }

  async disconnectAccount(userId: string, accountId: string): Promise<void> {
    await this.connectionManager.disconnect(userId, accountId);
    this.extensionsManager.clearAccount(accountId);
    auditLogger.info('MailService account disconnected', {
      actor_id: userId,
      metadata: { accountId },
    });
  }

  async shutdown(): Promise<void> {
    this.mimePipeline.destroy();
    await this.connectionManager.stop();
    this.extensionsManager.clearCache();
  }

  // ----------------------------------------------------------------
  // Mailboxes
  // ----------------------------------------------------------------
  async listMailboxes(userId: string, config: IAccountConfig): Promise<IMailbox[]> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    const mailboxes = await imap.listMailboxes(config);
    return mailboxes;
  }

  async createMailbox(userId: string, config: IAccountConfig, name: string): Promise<void> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    await imap.createMailbox(config, name);
  }

  async deleteMailbox(userId: string, config: IAccountConfig, name: string): Promise<void> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    await imap.deleteMailbox(config, name);
  }

  async renameMailbox(
    userId: string,
    config: IAccountConfig,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    await imap.renameMailbox(config, oldName, newName);
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------
  async searchMessages(
    userId: string,
    config: IAccountConfig,
    query: ISearchQuery,
  ): Promise<ISearchResult> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    return imap.search(config, query);
  }

  // ----------------------------------------------------------------
  // Fetch — legacy IMailMessage interface
  // ----------------------------------------------------------------
  async getMessage(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uid: string,
  ): Promise<IMailMessage | null> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    return imap.fetchMessage(config, mailbox, uid);
  }

  async getMessages(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uids: string[],
  ): Promise<IMailMessage[]> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    return imap.fetchMessages(config, mailbox, uids);
  }

  async getHeaders(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uids: string[],
  ): Promise<Partial<IMailMessage>[]> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    return imap.fetchHeaders(config, mailbox, uids);
  }

  // ----------------------------------------------------------------
  // Fetch + Full MIME Processing — new pipeline-aware methods
  // ----------------------------------------------------------------
  async fetchAndProcessMessage(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uid: string,
  ): Promise<ParsedEmail | null> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    const rawBuffer = await imap.fetchRaw(config, mailbox, uid);

    if (!rawBuffer || rawBuffer.length === 0) return null;

    const parsed = await this.mimePipeline.process(rawBuffer, uid);

    auditLogger.info('Full MIME pipeline processed', {
      actor_id: userId,
      metadata: {
        uid,
        durationMs: parsed.processingDurationMs,
        attachments: parsed.attachments.length,
        security: parsed.security.overallRisk,
      },
    });

    return parsed;
  }

  async fetchAndProcessMessages(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uids: string[],
  ): Promise<ParsedEmail[]> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);

    const messages: Array<{ buffer: Buffer; uid: string }> = [];
    for (const uid of uids) {
      try {
        const raw = await imap.fetchRaw(config, mailbox, uid);
        if (raw && raw.length > 0) {
          messages.push({ buffer: raw, uid });
        }
      } catch (err) {
        auditLogger.warn('Failed to fetch raw for pipeline', {
          actor_id: userId,
          metadata: { uid, error: (err as Error).message },
        });
      }
    }

    const parsedEmails = await this.mimePipeline.processBatch(messages);

    auditLogger.info(`Pipeline batch processed: ${parsedEmails.length}/${uids.length}`, {
      actor_id: userId,
    });

    return parsedEmails;
  }

  async parseRawEmail(rawBuffer: Buffer, uid: string): Promise<ParsedEmail> {
    return this.mimePipeline.process(rawBuffer, uid);
  }

  async scanAttachmentsAsync(uid: string, parsed: ParsedEmail): Promise<void> {
    if (parsed.attachments.length === 0) return;
    await this.mimePipeline.scanAttachmentsAsync(parsed.attachments, uid);
  }

  // ----------------------------------------------------------------
  // Flags
  // ----------------------------------------------------------------
  async addFlags(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uid: string,
    flags: string[],
  ): Promise<void> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    await imap.setFlags(config, mailbox, uid, flags, true);
  }

  async removeFlags(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uid: string,
    flags: string[],
  ): Promise<void> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    await imap.clearFlags(config, mailbox, uid, flags);
  }

  async markAsRead(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uid: string,
  ): Promise<void> {
    await this.addFlags(userId, config, mailbox, uid, ['\\Seen']);
  }

  async markAsUnread(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uid: string,
  ): Promise<void> {
    await this.removeFlags(userId, config, mailbox, uid, ['\\Seen']);
  }

  async markAsFlagged(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uid: string,
  ): Promise<void> {
    await this.addFlags(userId, config, mailbox, uid, ['\\Flagged']);
  }

  async markAsDeleted(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uid: string,
  ): Promise<void> {
    await this.addFlags(userId, config, mailbox, uid, ['\\Deleted']);
  }

  // ----------------------------------------------------------------
  // Mutations
  // ----------------------------------------------------------------
  async deleteMessages(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uids: string[],
  ): Promise<void> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    await imap.deleteMessages(config, mailbox, uids);
  }

  async moveMessages(
    userId: string,
    config: IAccountConfig,
    fromMailbox: string,
    toMailbox: string,
    uids: string[],
  ): Promise<void> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);

    if (!this.extensionsManager.hasExtension(config.accountId, 'MOVE' as any)) {
      const copied = await imap.copyMessages(config, fromMailbox, toMailbox, uids);
      await imap.deleteMessages(config, fromMailbox, copied);
      auditLogger.info('MOVE fallback: COPY+DELETE used', {
        actor_id: userId,
        metadata: { moved: copied.length },
      });
      return;
    }

    await imap.moveMessages(config, fromMailbox, toMailbox, uids);
  }

  async copyMessages(
    userId: string,
    config: IAccountConfig,
    fromMailbox: string,
    toMailbox: string,
    uids: string[],
  ): Promise<string[]> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);
    return imap.copyMessages(config, fromMailbox, toMailbox, uids);
  }

  // ----------------------------------------------------------------
  // Send
  // ----------------------------------------------------------------
  async sendMessage(
    userId: string,
    config: IAccountConfig,
    message: ICreateMessageInput,
  ): Promise<ISendResult> {
    if (!message.to || message.to.length === 0) {
      throw new CruxError('INVALID_PAYLOAD', 'At least one recipient required');
    }

    const smtp = await this.connectionManager.getSmtpAdapter(userId, config);
    const result = await smtp.send(config, message);

    auditLogger.info('Message sent via MailService', {
      actor_id: userId,
      metadata: {
        envelopeId: result.envelopeId,
        accepted: result.accepted.length,
        rejected: result.rejected.length,
      },
    });

    return result;
  }

  // ----------------------------------------------------------------
  // Sync / Idle
  // ----------------------------------------------------------------
  async checkForChanges(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    modSeq?: string,
  ): Promise<ISyncResponse> {
    const imap = await this.connectionManager.getImapAdapter(userId, config);

    if (this.extensionsManager.hasExtension(config.accountId, 'CONDSTORE' as any)) {
      return imap.checkForChanges(config, mailbox, modSeq);
    }

    return imap.checkForChanges(config, mailbox);
  }

  // ----------------------------------------------------------------
  // MIME Pipeline config
  // ----------------------------------------------------------------
  updateMimeConfig(config: Partial<MimePipelineConfig>): void {
    this.mimePipeline.updateConfig(config);
  }

  // ----------------------------------------------------------------
  // Pool / Status
  // ----------------------------------------------------------------
  getPoolInfo() {
    return this.connectionManager.getPoolInfo();
  }

  getServerProfile(accountId: string) {
    return this.extensionsManager.profiles?.get?.(accountId);
  }
}

// ------------------------------------------------------------------
// Singleton
// ------------------------------------------------------------------
let _mailService: MailService | null = null;

export function getMailService(): MailService {
  if (!_mailService) {
    _mailService = new MailService();
  }
  return _mailService;
}

export function resetMailService(): void {
  if (_mailService) {
    void _mailService.shutdown();
    _mailService = null;
  }
}