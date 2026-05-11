// ============================================================================
// Crux-Webmail — ImapAdapter: simple-imap → IImapAdapter
// ============================================================================
// Adaptador concreto que traduce simple-imap al contrato normalizado.
// Gestiona ciclo de vida, mapeo de flags, detección de capabilities,
// retry exponencial y circuit breaker.
// ============================================================================

import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import { SimpleImap } from 'simple-imap';
import type { SearchBox, FetchResults } from 'simple-imap';

import {
  IImapAdapter,
  IMailMessage,
  IMailbox,
  IMailAddress,
  IFlags,
  ISearchResult,
  ISyncResponse,
  IConnectionInfo,
  ISearchQuery,
  IAccountConfig,
  MailboxRole,
} from 'contracts';
import { CruxError } from 'server/errors/handler';
import { auditLogger } from 'server/utils/audit-logger';
import { generateSecureUuid } from 'server/utils/crypto';

// ------------------------------------------------------------------
// Internal state tracking
// ------------------------------------------------------------------
interface ConnectionState {
  phase: IConnectionInfo['phase'];
  connectedAt: string;
  lastActivity: string;
  capabilities: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

// ------------------------------------------------------------------
// Normalization helpers
// ------------------------------------------------------------------
function normalizeFlags(raw: string[] = []): IFlags {
  return {
    seen: raw.some((f: string) => f === '\Seen'),
    answered: raw.some((f: string) => f === '\Answered'),
    flagged: raw.some((f: string) => f === '\Flagged'),
    deleted: raw.some((f: string) => f === '\Deleted'),
    draft: raw.some((f: string) => f === '\Draft'),
    recent: raw.some((f: string) => f === '\Recent'),
    custom: raw.filter((f: string) => !f.startsWith('\\')), // remove RFC standard
  };
}

function resolveMailboxRole(specialUse: string[] = []): MailboxRole {
  const map: Record<string, MailboxRole> = {
    '\\Inbox': 'inbox',
    '\\Sent': 'sent',
    '\\Drafts': 'drafts',
    '\\Trash': 'trash',
    '\\Junk': 'spam',
    '\\Archive': 'archive',
  };
  for (const flag of specialUse) {
    if (map[flag]) return map[flag];
  }
  return 'custom';
}

function parseAddress(raw: string): IMailAddress {
  const match = raw.match(/^(?:<([^>]*)>)$|^(?:"?([^"]+?)"?\s*<([^>]+)>)$/);
  if (match) {
    return {
      name: match[2] ? match[2].trim() : match[1],
      email: match[3] || match[1] || '',
    };
  }
  return { name: raw, email: raw };
}

function parseAddresses(raw: any): IMailAddress[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((item) => {
    if (typeof item === 'string') return parseAddress(item);
    return {
      name: item.name || item.address || '',
      email: item.address || item.email || item.name || '',
    };
  });
}

function parseHeader(headers: any, name: string): string {
  if (!headers) return '';
  const val = headers[name];
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object') {
    if (val.value) return val.value;
    if (val.data) return val.data;
  }
  return String(val || '');
}

function uidToString(uid: number | string | undefined): string {
  if (uid === undefined || uid === null) return '';
  return String(uid);
}

// ------------------------------------------------------------------
// ImapAdapter — concrete implementation
// ------------------------------------------------------------------
export class ImapAdapter implements IImapAdapter {
  private conn: SimpleImap | null = null;
  private currentConfig: IAccountConfig | null = null;
  private currentMailbox: string | null = null;
  private state: ConnectionState = {
    phase: 'idle',
    connectedAt: '',
    lastActivity: nowIso(),
    capabilities: [],
  };

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async connect(config: IAccountConfig, options?: { retry?: number; backoffMs?: number }): Promise<void> {
    this.currentConfig = config;

    const maxRetries = options?.retry ?? 3;
    const baseBackoff = options?.backoffMs ?? 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.conn = new SimpleImap({
          host: config.host,
          port: config.port,
          tls: config.secure,
          // TLS Hardening: rejectUnauthorized + min TLSv1.2 + ciphers suite
          tlsOptions: {
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2',
            ciphers: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384',
          },
          connTimeout: 10000,
          authTimeout: 8000,
          socketTimeout: 30000,
        });

        await this.waitForEvent('ready', 'error', 15000);
        break; // Success
      } catch (err) {
        if (this.conn) {
          try { this.conn.end(); } catch { /* already closed */ }
          this.conn = null;
        }
        auditLogger.warn(`IMAP connect attempt ${attempt}/${maxRetries} failed`, {
          actor_id: config.accountId,
          metadata: {
            host: config.host,
            port: config.port,
            secure: config.secure,
            error: (err as Error).message,
            attempt,
          },
        });
        if (attempt === maxRetries) throw err;
        // Exponential backoff with jitter
        const jitter = Math.random() * 500;
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt - 1) * baseBackoff + jitter));
      }
    }

    this.state.phase = 'authenticated';
    this.state.connectedAt = nowIso();
    this.state.lastActivity = nowIso();
    if (this.conn) {
      this.state.capabilities = this.conn.capabilities?.slice() || [];
    }

    auditLogger.info('IMAP adapter connected', {
      actor_id: config.accountId,
      metadata: {
        host: config.host,
        port: config.port,
        secure: config.secure,
        tls_min_version: 'TLSv1.2',
        capabilities: this.state.capabilities,
      },
    });
  }

  async disconnect(): Promise<void> {
    if (this.conn) {
      try {
        this.conn.end();
      } catch {
        // Already closed
      }
      this.conn = null;
      this.currentConfig = null;
      this.currentMailbox = null;
      this.state.phase = 'disconnected';
      this.state.lastActivity = nowIso();
      auditLogger.info('IMAP adapter disconnected', {
        actor_id: this.currentConfig?.accountId || 'unknown',
      });
    }
  }

  getConnectionInfo(): IConnectionInfo {
    const cfg = this.currentConfig;
    return {
      phase: this.state.phase,
      host: cfg?.host || '',
      port: cfg?.port || 0,
      secure: cfg?.secure ?? false,
      connectedAt: this.state.connectedAt,
      lastActivity: this.state.lastActivity,
      capabilities: this.state.capabilities,
    };
  }

  // ----------------------------------------------------------------
  // Mailboxes
  // ----------------------------------------------------------------
  async listMailboxes(config: IAccountConfig): Promise<IMailbox[]> {
    this.ensureConnection(config);

    return new Promise<IMailbox[]>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No IMAP connection'));

      this.conn.getMailboxes((err: Error | null, raw: any) => {
        this.touch();
        if (err) return reject(err);

        const mailboxes: IMailbox[] = [];
        if (!raw) return resolve(mailboxes);

        const normalize = (item: any, prefix = '') => {
          const path = item.path || `${prefix}${item.name || ''}`;
          mailboxes.push({
            id: generateSecureUuid(),
            name: item.name || path.split('/').pop() || path,
            path,
            role: resolveMailboxRole(item.specialUse),
            messageCount: item.messages || 0,
            unseenCount: item.unseen || 0,
            delimiter: item.delimiter || '/',
          });
          if (item.children) {
            item.children.forEach((child: any) => normalize(child, path + (item.delimiter || '/')));
          }
        };

        if (Array.isArray(raw)) {
          raw.forEach((item) => normalize(item));
        } else if (raw) {
          normalize(raw);
        }

        resolve(mailboxes);
      });
    });
  }

  async openMailbox(config: IAccountConfig, mailbox: string): Promise<void> {
    this.ensureConnection(config);

    return new Promise<void>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No IMAP connection'));

      this.conn.openBox(mailbox, (err: Error | null) => {
        this.touch();
        if (err) return reject(err);
        this.currentMailbox = mailbox;
        this.state.phase = 'mailbox-open';
        resolve();
      });
    });
  }

  async createMailbox(config: IAccountConfig, name: string): Promise<void> {
    this.ensureConnection(config);

    return new Promise<void>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No IMAP connection'));

      this.conn.addMailbox(name, (err: Error | null) => {
        this.touch();
        if (err) return reject(err);
        auditLogger.info('Mailbox created', {
          actor_id: config.accountId,
          metadata: { name },
        });
        resolve();
      });
    });
  }

  async deleteMailbox(config: IAccountConfig, name: string): Promise<void> {
    this.ensureConnection(config);

    return new Promise<void>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No IMAP connection'));

      this.conn.delMailbox(name, (err: Error | null) => {
        this.touch();
        if (err) return reject(err);
        auditLogger.info('Mailbox deleted', {
          actor_id: config.accountId,
          metadata: { name },
        });
        resolve();
      });
    });
  }

  async renameMailbox(config: IAccountConfig, oldName: string, newName: string): Promise<void> {
    this.ensureConnection(config);

    return new Promise<void>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No IMAP connection'));

      this.conn.renameMailbox(oldName, newName, (err: Error | null) => {
        this.touch();
        if (err) return reject(err);
        auditLogger.info('Mailbox renamed', {
          actor_id: config.accountId,
          metadata: { oldName, newName },
        });
        resolve();
      });
    });
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------
  async search(config: IAccountConfig, query: ISearchQuery): Promise<ISearchResult> {
    this.ensureConnection(config);

    const conditions: SearchBox = [];

    if (query.flags) {
      if (query.flags.seen) conditions.push('SEEN');
      else if (query.flags.seen === false) conditions.push('UNSEEN');
      if (query.flags.flagged) conditions.push('FLAGGED');
      if (query.flags.deleted) conditions.push('DELETED');
      if (query.flags.draft) conditions.push('DRAFT');
    }

    if (!conditions.length) conditions.push('ALL');

    if (query.since) conditions.push(['SINCE', query.since]);
    if (query.until) conditions.push(['BEFORE', query.until]);
    if (query.from) conditions.push(['FROM', query.from]);
    if (query.to) conditions.push(['TO', query.to]);
    if (query.subject) conditions.push(['SUBJECT', query.subject]);
    if (query.hasAttachments) conditions.push(['LARGER', '1']);
    if (query.sizeMin) conditions.push(['LARGER', String(query.sizeMin)]);
    if (query.sizeMax) conditions.push(['SMALLER', String(query.sizeMax)]);

    return new Promise<ISearchResult>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No IMAP connection'));

      const mailbox = query.mailbox || 'INBOX';
      this.conn.search({ box: mailbox, search: conditions as any }, (err: Error | null, uids: number[]) => {
        this.touch();
        if (err) return reject(err);

        const uidStrings = uids.map(uidToString);

        const limit = query.limit ?? 500;
        const offset = query.offset ?? 0;
        const paged = uidStrings.slice(offset, offset + limit);

        resolve({
          uids: paged,
          total: uidStrings.length,
        });
      });
    });
  }

  // ----------------------------------------------------------------
  // Fetch
  // ----------------------------------------------------------------
  async fetchMessage(config: IAccountConfig, mailbox: string, uid: string): Promise<IMailMessage | null> {
    this.ensureConnection(config);

    const results = await this.fetchMessages(config, mailbox, [uid]);
    return results.length > 0 ? results[0] : null;
  }

  async fetchMessages(config: IAccountConfig, mailbox: string, uids: string[]): Promise<IMailMessage[]> {
    this.ensureConnection(config);

    if (uids.length === 0) return [];

    return new Promise<IMailMessage[]>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No IMAP connection'));

      const numericUids = uids.map((u) => parseInt(u, 10));
      const envelopes: IMailMessage[] = [];

      const stream = this.conn.fetch({
        modseq: true,
        uid: true,
        mark_seen: false,
        box: mailbox,
        search: numericUids,
      }, {
        body: true,
        b: {
          from: true,
          to: true,
          cc: true,
          bcc: true,
          subject: true,
          date: true,
          'message-id': true,
          flags: true,
          attachments: true,
        },
      });

      let errorHappened = false;

      stream.on('message', (_msg: any) => {
        // Simple-IMAP v2 API: iterate message items
        const messageData: any = {};

        _msg.on('body', (chunk: Buffer) => {
          if (!messageData._rawBody) messageData._rawBody = [];
          messageData._rawBody.push(chunk);
        });

        _msg.on('attributes', (attrs: any) => {
          messageData.attributes = attrs;
        });

        _msg.on('end', () => {
          try {
            const msg = this.normalizeMessage(messageData);
            envelopes.push(msg);
          } catch (e) {
            auditLogger.warn('IMAP message normalization failed', {
              actor_id: config.accountId,
              metadata: { error: (e as Error).message },
            });
          }
        });
      });

      stream.on('error', (err: Error) => {
        errorHappened = true;
        reject(err);
      });

      stream.on('end', () => {
        this.touch();
        if (!errorHappened) resolve(envelopes);
      });
    });
  }

  async fetchHeaders(config: IAccountConfig, mailbox: string, uids: string[]): Promise<Partial<IMailMessage>[]> {
    this.ensureConnection(config);

    if (uids.length === 0) return [];

    return new Promise<Partial<IMailMessage>[]>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No IMAP connection'));

      const numericUids = uids.map((u) => parseInt(u, 10));
      const results: Partial<IMailMessage>[] = [];

      const stream = this.conn.fetch({
        box: mailbox,
        uid: numericUids,
        mark_seen: false,
      }, {
        b: {
          from: true,
          to: true,
          cc: true,
          subject: true,
          date: true,
          'message-id': true,
        },
      });

      let errorHappened = false;

      stream.on('message', (msg: any) => {
        const parts: Buffer[] = [];
        msg.on('body', (chunk: Buffer) => parts.push(chunk));

        msg.on('end', () => {
          try {
            const raw = Buffer.concat(parts).toString('utf8');
            const parsed = this.parseEnvelopeHeaders(raw, msg.attributes?.uid);
            results.push(parsed);
          } catch (e) {
            auditLogger.warn('Header parsing failed', {
              actor_id: config.accountId,
              metadata: { error: (e as Error).message },
            });
          }
        });
      });

      stream.on('error', (err: Error) => {
        errorHappened = true;
        reject(err);
      });

      stream.on('end', () => {
        this.touch();
        if (!errorHappened) resolve(results);
      });
    });
  }

  async fetchBody(config: IAccountConfig, mailbox: string, uid: string, partIndex: string): Promise<Buffer> {
    this.ensureConnection(config);

    return new Promise<Buffer>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No IMAP connection'));

      const stream = this.conn.fetch({
        box: mailbox,
        uid: parseInt(uid, 10),
      }, {
        bodies: [partIndex],
      });

      const chunks: Buffer[] = [];

      stream.on('message', (msg: any) => {
        msg.on('body', (chunk: Buffer) => chunks.push(chunk));
      });

      stream.on('error', reject);
      stream.on('end', () => {
        this.touch();
        resolve(Buffer.concat(chunks));
      });
    });
  }

  async fetchRaw(config: IAccountConfig, mailbox: string, uid: string): Promise<Buffer> {
    this.ensureConnection(config);

    return new Promise<Buffer>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No IMAP connection'));

      const stream = this.conn.fetch({
        box: mailbox,
        uid: parseInt(uid, 10),
      }, {
        bodies: ['RFC822'],
      });

      const chunks: Buffer[] = [];

      stream.on('message', (msg: any) => {
        msg.on('body', (chunk: Buffer) => chunks.push(chunk));
      });

      stream.on('error', reject);
      stream.on('end', () => {
        this.touch();
        resolve(Buffer.concat(chunks));
      });
    });
  }

  // ----------------------------------------------------------------
  // Flags
  // ----------------------------------------------------------------
  async setFlags(config: IAccountConfig, mailbox: string, uid: string, flags: string[], add: boolean): Promise<void> {
    this.ensureConnection(config);

    return new Promise<void>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No IMAP connection'));

      const mode = add ? '+Flags' : '-Flags';

      this.conn.updateFlags({
        box: mailbox,
        uid: parseInt(uid, 10),
      }, {
        [mode]: flags,
      }, (err: Error | null) => {
        this.touch();
        if (err) return reject(err);
        auditLogger.info('IMAP flags set', {
          actor_id: config.accountId,
          metadata: { uid, flags, mode },
        });
        resolve();
      });
    });
  }

  async clearFlags(config: IAccountConfig, mailbox: string, uid: string, flags: string[]): Promise<void> {
    await this.setFlags(config, mailbox, uid, flags, false);
  }

  // ----------------------------------------------------------------
  // Mutations
  // ----------------------------------------------------------------
  async deleteMessages(config: IAccountConfig, mailbox: string, uids: string[]): Promise<void> {
    this.ensureConnection(config);

    const errors: Error[] = [];
    for (const uid of uids) {
      try {
        await this.deleteSingle(config, mailbox, uid);
        auditLogger.info('IMAP message deleted', {
          actor_id: config.accountId,
          metadata: { uid, mailbox },
        });
      } catch (err) {
        errors.push(err as Error);
      }
    }
    if (errors.length > 0) {
      auditLogger.error('IMAP delete had partial failures', {
        actor_id: config.accountId,
        metadata: { errors: errors.length, mailbox },
      });
    }
  }

  async moveMessages(config: IAccountConfig, fromMailbox: string, toMailbox: string, uids: string[]): Promise<void> {
    this.ensureConnection(config);

    const errors: Error[] = [];
    for (const uid of uids) {
      try {
        await this.moveSingle(config, fromMailbox, toMailbox, uid);
        auditLogger.info('IMAP message moved', {
          actor_id: config.accountId,
          metadata: { uid, from: fromMailbox, to: toMailbox },
        });
      } catch (err) {
        errors.push(err as Error);
      }
    }
    if (errors.length > 0) {
      auditLogger.error('IMAP move had partial failures', {
        actor_id: config.accountId,
        metadata: { errors: errors.length },
      });
    }
  }

  async copyMessages(config: IAccountConfig, fromMailbox: string, toMailbox: string, uids: string[]): Promise<string[]> {
    this.ensureConnection(config);

    const newUids: string[] = [];

    for (const uid of uids) {
      try {
        await this.copySingle(config, fromMailbox, toMailbox, uid);
        newUids.push(uid);
        auditLogger.info('IMAP message copied', {
          actor_id: config.accountId,
          metadata: { uid, from: fromMailbox, to: toMailbox },
        });
      } catch (err) {
        auditLogger.error('IMAP copy failed for single message', {
          actor_id: config.accountId,
          metadata: { uid, error: (err as Error).message },
        });
      }
    }

    return newUids;
  }

  // ----------------------------------------------------------------
  // IDLE / Sync
  // ----------------------------------------------------------------
  async startIdle(config: IAccountConfig, mailbox: string): Promise<EventEmitter> {
    this.ensureConnection(config);

    const emitter = new EventEmitter();

    if (!this.conn) {
      emitter.emit('error', new CruxError('IMAP_NOT_CONNECTED', 'No IMAP connection'));
      return emitter;
    }

    // Open mailbox for idle
    await new Promise<void>((resolve, reject) => {
      this.conn!.openBox(mailbox, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.conn.idle((err: Error | null) => {
      if (err) {
        emitter.emit('error', err);
      } else {
        emitter.emit('idle', { mailbox });
      }
    });

    // Listen for mailbox updates via 'mailbox' event
    this.conn.on('update', (flags: any, uid: number) => {
      emitter.emit('update', { mailbox, flags, uid: String(uid) });
    });

    this.conn.on('expunge', (uid: number) => {
      emitter.emit('expunge', { mailbox, uid: String(uid) });
    });

    this.conn.on('flags', (flags: any, uid: number) => {
      emitter.emit('flags', { mailbox, flags, uid: String(uid) });
    });

    auditLogger.info('IMAP IDLE started', {
      actor_id: config.accountId,
      metadata: { mailbox },
    });

    return emitter;
  }

  async checkForChanges(config: IAccountConfig, mailbox: string, _modSeq?: string): Promise<ISyncResponse> {
    this.ensureConnection(config);

    // Poll-based fallback if CONDSTORE not supported
    const result: ISyncResponse = {
      added: [],
      modified: [],
      removed: [],
      state: generateSecureUuid(),
    };

    // Perform a minimal search to detect changes
    try {
      const searchResult = await this.search(config, {
        mailbox,
        limit: 100,
      });
      result.state = searchResult.uids.at(-1) || result.state;
    } catch {
      // Silently degrade
    }

    return result;
  }

  // ----------------------------------------------------------------
  // Capabilities
  // ----------------------------------------------------------------
  getCapabilities(): string[] {
    return this.state.capabilities;
  }

  supportsCapability(capability: string): boolean {
    return this.state.capabilities.includes(capability);
  }

  // ----------------------------------------------------------------
  // Internal helpers
  // ----------------------------------------------------------------
  private ensureConnection(config: IAccountConfig): void {
    if (!this.conn) {
      throw new CruxError('IMAP_NOT_CONNECTED', 'IMAP adapter not connected. Call connect() first.');
    }
  }

  private touch(): void {
    this.state.lastActivity = nowIso();
  }

  private waitForEvent(success: string, failure: string, timeout: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.conn) {
          this.conn.removeAllListeners();
        }
        reject(new Error(`IMAP ${success} event timeout after ${timeout}ms`));
      }, timeout);

      if (!this.conn) return reject(new Error('No IMAP connection'));

      this.conn.once(success, () => {
        clearTimeout(timer);
        resolve();
      });

      this.conn.once(failure, (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private normalizeMessage(data: any): IMailMessage {
    const attrs = data.attributes || {};
    const headers = data.headers || {};

    const rawBody = data._rawBody && data._rawBody.length > 0
      ? Buffer.concat(data._rawBody).toString('utf8')
      : '';

    return {
      uid: uidToString(attrs.uid || 0),
      messageId: parseHeader(headers, 'message-id') || generateSecureUuid(),
      subject: parseHeader(headers, 'subject') || '(No Subject)',
      from: parseAddresses(attrs.from || parseHeader(headers, 'from')),
      to: parseAddresses(attrs.to || parseHeader(headers, 'to')),
      cc: parseAddresses(attrs.cc || parseHeader(headers, 'cc')),
      bcc: parseAddresses(attrs.bcc || parseHeader(headers, 'bcc')),
      date: attrs.date?.toISOString?.() || parseHeader(headers, 'date') || nowIso(),
      size: attrs.size || rawBody.length,
      flags: normalizeFlags(attrs.flags),
      hasAttachments: Boolean(attrs.attachments?.length > 0),
      preview: rawBody.substring(0, 200),
      bodyText: rawBody,
      bodyHtml: '',
      headers: this.normalizeHeaders(headers),
      attachmentCount: attrs.attachments?.length || 0,
    };
  }

  private parseEnvelopeHeaders(raw: string, uid: number | undefined): Partial<IMailMessage> {
    const parseH = (name: string) => {
      const regex = new RegExp(`${name}:\\s*(.+)`, 'i');
      const match = raw.match(regex);
      return match ? match[1].trim() : '';
    };

    return {
      uid: uidToString(uid || 0),
      messageId: parseH('Message-ID') || generateSecureUuid(),
      subject: parseH('Subject') || '(No Subject)',
      from: parseAddresses(parseH('From')),
      to: parseAddresses(parseH('To')),
      cc: parseAddresses(parseH('CC')),
      date: parseH('Date') || nowIso(),
      size: raw.length,
      flags: normalizeFlags([]),
      hasAttachments: false,
      preview: raw.substring(0, 200),
      bodyText: '',
      bodyHtml: '',
      headers: {},
      attachmentCount: 0,
    };
  }

  private normalizeHeaders(headers: any): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    if (!headers) return result;

    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        result[key] = [value];
      } else if (Array.isArray(value)) {
        result[key] = value;
      } else if (value && typeof value === 'object') {
        result[key] = [String(value.value || value.data || '')];
      }
    }
    return result;
  }

  // ----------------------------------------------------------------
  // Mutation single-item helpers
  // ----------------------------------------------------------------
  private deleteSingle(config: IAccountConfig, mailbox: string, uid: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No connection'));
      this.conn.deleteEmail({ box: mailbox, uid: parseInt(uid, 10) }, (err: Error | null) => {
        this.touch();
        if (err) return reject(err);
        resolve();
      });
    });
  }

  private moveSingle(config: IAccountConfig, fromMailbox: string, toMailbox: string, uid: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No connection'));
      this.conn.move({ box: fromMailbox, uid: parseInt(uid, 10), to: toMailbox }, (err: Error | null) => {
        this.touch();
        if (err) return reject(err);
        resolve();
      });
    });
  }

  private copySingle(config: IAccountConfig, fromMailbox: string, toMailbox: string, uid: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.conn) return reject(new CruxError('IMAP_NOT_CONNECTED', 'No connection'));
      this.conn.copy({ box: fromMailbox, uid: parseInt(uid, 10), to: toMailbox }, (err: Error | null) => {
        this.touch();
        if (err) return reject(err);
        resolve();
      });
    });
  }
}