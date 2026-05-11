// ============================================================================
// Crux-Webmail — MailboxSyncService
// ============================================================================
// Sincronización de carpetas: conteos, detección de cambios, refresh
// incremental. Se integra con IMAP IDLE y polling como fallback.
// ============================================================================

import { EventEmitter } from 'node:events';
import { getMailService } from './mail-service';
import { getWSGateway } from 'ws/ws-gateway';
import { getFlagSyncService } from './flag-sync.service';
import { auditLogger } from 'utils/audit-logger';
import type { IAccountConfig } from './contracts';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface MailboxState {
  name: string;
  path: string;
  total: number;
  unseen: number;
  modSeq: string;
  lastSynced: number;
  syncing: boolean;
  error: string | null;
}

export interface SyncProgress {
  status: 'idle' | 'syncing' | 'error';
  progress: number;
  mailbox: string;
  message?: string;
}

export interface SyncResult {
  added: string[];
  modified: string[];
  removed: string[];
  mailboxCounts: Record<string, { total: number; unseen: number }>;
}

// ------------------------------------------------------------------
// MailboxSyncService
// ------------------------------------------------------------------
export class MailboxSyncService extends EventEmitter {
  private mailboxStates = new Map<string, Map<string, MailboxState>>();
  private syncProgress = new Map<string, SyncProgress>();
  private pollIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private flagSync = getFlagSyncService();
  private readonly FALLBACK_POLL_MS = 30_000;

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  // ----------------------------------------------------------------
  // Full Sync
  // ----------------------------------------------------------------
  async fullSync(userId: string, config: IAccountConfig): Promise<SyncResult> {
    this.setSyncProgress(userId, 'syncing', 0, '', 'Starting full mailbox sync');

    try {
      const mailService = getMailService();
      const mailboxes = await mailService.listMailboxes(userId, config);

      const added: string[] = [];
      const modified: string[] = [];
      const removed: string[] = [];
      const currentPaths = new Set<string>();
      const mailboxCounts: Record<string, { total: number; unseen: number }> = {};

      for (let i = 0; i < mailboxes.length; i++) {
        const mb = mailboxes[i]!;
        currentPaths.add(mb.path);
        const counts = { total: mb.messageCount, unseen: mb.unseenCount };
        mailboxCounts[mb.path] = counts;

        const prev = this.getCachedMailbox(userId, mb.path);
        if (!prev) {
          added.push(mb.path);
        } else if (prev.total !== mb.messageCount || prev.unseen !== mb.unseenCount) {
          modified.push(mb.path);
        }

        this.cacheMailbox(userId, mb.path, {
          name: mb.name,
          path: mb.path,
          total: mb.messageCount,
          unseen: mb.unseenCount,
          modSeq: String(mb.messageCount),
          lastSynced: Date.now(),
          syncing: false,
          error: null,
        });

        const progress = Math.round(((i + 1) / mailboxes.length) * 100);
        this.setSyncProgress(userId, 'syncing', progress, mb.name);
      }

      // Detect removed mailboxes
      const cachedUser = this.mailboxStates.get(userId);
      if (cachedUser) {
        for (const path of cachedUser.keys()) {
          if (!currentPaths.has(path)) {
            removed.push(path);
            cachedUser.delete(path);
          }
        }
      }

      this.setSyncProgress(userId, 'idle', 100, '', 'Sync complete');
      this.broadcastFolderCounts(userId, mailboxCounts);

      for (const mbPath of modified) {
        this.flagSync.invalidateMailboxCache(userId, mbPath);
      }

      auditLogger.info('Full mailbox sync completed', {
        actor_id: userId,
        metadata: { added: added.length, modified: modified.length, removed: removed.length, total: mailboxes.length },
      });

      this.emit('sync:complete', { userId, added, modified, removed });
      return { added, modified, removed, mailboxCounts };
    } catch (err) {
      this.setSyncProgress(userId, 'error', 0, '', (err as Error).message);
      auditLogger.error('Full mailbox sync failed', { actor_id: userId, metadata: { error: (err as Error).message } });
      throw err;
    }
  }

  // ----------------------------------------------------------------
  // Incremental Sync
  // ----------------------------------------------------------------
  async incrementalSync(userId: string, config: IAccountConfig, mailbox: string): Promise<SyncResult> {
    const prev = this.getCachedMailbox(userId, mailbox);
    this.setSyncProgress(userId, 'syncing', 0, mailbox, 'Checking for changes');

    try {
      const mailService = getMailService();
      const syncResponse = await mailService.checkForChanges(userId, config, mailbox, prev?.modSeq);

      const mailboxes = await mailService.listMailboxes(userId, config);
      const mb = mailboxes.find((m) => m.path === mailbox);

      const counts: Record<string, { total: number; unseen: number }> = {};
      if (mb) {
        counts[mailbox] = { total: mb.messageCount, unseen: mb.unseenCount };
        this.cacheMailbox(userId, mailbox, {
          name: mb.name,
          path: mb.path,
          total: mb.messageCount,
          unseen: mb.unseenCount,
          modSeq: syncResponse.state,
          lastSynced: Date.now(),
          syncing: false,
          error: null,
        });
      }

      this.setSyncProgress(userId, 'idle', 100, mailbox, 'Incremental sync complete');

      if (mb && prev && (prev.total !== mb.messageCount || prev.unseen !== mb.unseenCount)) {
        this.broadcastFolderCounts(userId, counts);
      }

      auditLogger.info('Incremental sync completed', {
        actor_id: userId,
        metadata: { mailbox, added: syncResponse.added.length, modified: syncResponse.modified.length, removed: syncResponse.removed.length },
      });

      return {
        added: syncResponse.added,
        modified: syncResponse.modified,
        removed: syncResponse.removed,
        mailboxCounts: counts,
      };
    } catch (err) {
      this.setSyncProgress(userId, 'error', 0, mailbox, (err as Error).message);
      throw err;
    }
  }

  // ----------------------------------------------------------------
  // Queries
  // ----------------------------------------------------------------
  getMailboxState(userId: string, mailbox: string): MailboxState | null {
    return this.getCachedMailbox(userId, mailbox);
  }

  getAllMailboxStates(userId: string): Record<string, MailboxState> {
    const userMap = this.mailboxStates.get(userId);
    if (!userMap) return {};
    const result: Record<string, MailboxState> = {};
    for (const [path, state] of userMap) {
      result[path] = state;
    }
    return result;
  }

  getSyncProgress(userId: string): SyncProgress {
    return this.syncProgress.get(userId) || { status: 'idle', progress: 0, mailbox: '' };
  }

  // ----------------------------------------------------------------
  // Polling (fallback)
  // ----------------------------------------------------------------
  startPolling(userId: string, config: IAccountConfig): void {
    this.stopPolling(userId);
    const interval = setInterval(async () => {
      try {
        await this.fullSync(userId, config);
      } catch {
        // Non-fatal
      }
    }, this.FALLBACK_POLL_MS);
    this.pollIntervals.set(userId, interval);
  }

  stopPolling(userId: string): void {
    const interval = this.pollIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(userId);
    }
  }

  // ----------------------------------------------------------------
  // IDLE listener
  // ----------------------------------------------------------------
  async startIdle(userId: string, config: IAccountConfig, mailbox: string): Promise<void> {
    try {
      const mailService = getMailService();
      const connMgr = mailService.getConnectionManager();
      const imapAdapter = connMgr.getImapAdapter(userId, config);

      const idleEmitter = await imapAdapter.startIdle(config, mailbox);

      idleEmitter.on('update', (data: unknown) => {
        const d = data as Record<string, unknown>;
        this.flagSync.applyExternalChange(
          userId,
          String(d.mailbox || ''),
          Number(d.uid),
          Object.keys((d.flags || {}) as Record<string, unknown>),
        );
        this.broadcastSyncStatus(userId, 'syncing', 50, String(d.mailbox), 'Flag change detected');
        setTimeout(async () => {
          try { await this.incrementalSync(userId, config, String(d.mailbox)); } catch {}
        }, 1000);
      });

      idleEmitter.on('expunge', (data: unknown) => {
        const d = data as Record<string, unknown>;
        this.flagSync.invalidateMailboxCache(userId, String(d.mailbox));
        this.broadcastSyncStatus(userId, 'syncing', 75, String(d.mailbox), 'Message removed');
        setTimeout(async () => {
          try { await this.incrementalSync(userId, config, String(d.mailbox)); } catch {}
        }, 1000);
      });

      idleEmitter.on('flags', (data: unknown) => {
        const d = data as Record<string, unknown>;
        this.flagSync.applyExternalChange(
          userId,
          String(d.mailbox || ''),
          Number(d.uid),
          Object.keys((d.flags || {}) as Record<string, unknown>),
        );
      });

      auditLogger.info('IMAP IDLE listener started', { actor_id: userId, metadata: { mailbox } });
    } catch (err) {
      auditLogger.warn('Failed to start IDLE, falling back to polling', {
        actor_id: userId,
        metadata: { mailbox, error: (err as Error).message },
      });
      this.startPolling(userId, config);
    }
  }

  // ----------------------------------------------------------------
  // Cache management
  // ----------------------------------------------------------------
  invalidateMailbox(userId: string, mailbox: string): void {
    const userMap = this.mailboxStates.get(userId);
    if (userMap) userMap.delete(mailbox);
  }

  clearUserState(userId: string): void {
    this.mailboxStates.delete(userId);
    this.syncProgress.delete(userId);
    this.flagSync.invalidateUserCache(userId);
  }

  // ----------------------------------------------------------------
  // Broadcast helpers
  // ----------------------------------------------------------------
  private broadcastFolderCounts(
    userId: string,
    counts: Record<string, { total: number; unseen: number }>,
  ): void {
    const gateway = getWSGateway();
    if (!gateway) return;
    gateway.sendToUser(userId, {
      type: 'FOLDER_COUNTS_UPDATED',
      payload: { counts },
      timestamp: Date.now(),
    });
  }

  private broadcastSyncStatus(
    userId: string,
    status: 'idle' | 'syncing' | 'error',
    progress: number,
    mailbox: string,
    message?: string,
  ): void {
    const gateway = getWSGateway();
    if (!gateway) return;
    gateway.sendToUser(userId, {
      type: 'SYNC_STATUS',
      payload: { status, progress, mailbox, message },
      timestamp: Date.now(),
    });
  }

  private setSyncProgress(
    userId: string,
    status: 'idle' | 'syncing' | 'error',
    progress: number,
    mailbox: string,
    message?: string,
  ): void {
    const prog: SyncProgress = { status, progress, mailbox, message };
    this.syncProgress.set(userId, prog);
    this.broadcastSyncStatus(userId, status, progress, mailbox, message);
  }

  private getCachedMailbox(userId: string, mailbox: string): MailboxState | null {
    const userMap = this.mailboxStates.get(userId);
    if (!userMap) return null;
    return userMap.get(mailbox) || null;
  }

  private cacheMailbox(userId: string, path: string, state: MailboxState): void {
    let userMap = this.mailboxStates.get(userId);
    if (!userMap) {
      userMap = new Map();
      this.mailboxStates.set(userId, userMap);
    }
    userMap.set(path, state);
  }

  destroy(): void {
    for (const [, interval] of this.pollIntervals) clearInterval(interval);
    this.pollIntervals.clear();
    this.mailboxStates.clear();
    this.syncProgress.clear();
    this.removeAllListeners();
  }
}

// ------------------------------------------------------------------
// Singleton
// ------------------------------------------------------------------
let _mailboxSync: MailboxSyncService | null = null;

export function getMailboxSyncService(): MailboxSyncService {
  if (!_mailboxSync) {
    _mailboxSync = new MailboxSyncService();
  }
  return _mailboxSync;
}

export function resetMailboxSyncService(): void {
  if (_mailboxSync) {
    _mailboxSync.destroy();
    _mailboxSync = null;
  }
}