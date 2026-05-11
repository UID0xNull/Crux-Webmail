// ============================================================================
// Crux-Webmail — FlagSyncService
// ============================================================================
// Gestión centralizada de banderas IMAP con:
// - Estado local cacheado por userId + mailbox + uid
// - Operaciones batch atómicas
// - Sincronización push vía WebSocket
// - Deduplicación de eventos flag
// - Consistencia eventual con IMAP real
// ============================================================================

import { EventEmitter } from 'node:events';
import { getMailService, MailService } from './mail-service';
import { getWSGateway } from '@modules/ws/ws-gateway';
import { auditLogger } from '@utils/audit-logger';
import type {
  IAccountConfig,
  IFlags,
} from './contracts';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export interface FlagState {
  uid: string;
  mailbox: string;
  flags: string[];
  parsed: NormalizedFlags;
  lastSynced: number;
  pending: boolean;
}

export interface NormalizedFlags {
  seen: boolean;
  answered: boolean;
  flagged: boolean;
  deleted: boolean;
  draft: boolean;
  recent: boolean;
  custom: string[];
}

export interface FlagOperation {
  uid: string;
  action: 'add' | 'remove' | 'set';
  flags: string[];
}

export interface BatchFlagOperation {
  mailbox: string;
  uids: string[];
  action: 'add' | 'remove' | 'set';
  flags: string[];
}

// Standard IMAP system flags
const SYSTEM_FLAGS = [
  '\\Seen',
  '\\Answered',
  '\\Flagged',
  '\\Deleted',
  '\\Draft',
  '\\Recent',
];

// ------------------------------------------------------------------
// FlagSyncService
// ------------------------------------------------------------------
export class FlagSyncService extends EventEmitter {
  private mailService: MailService;

  // Local cache: userId -> mailbox -> uid -> FlagState
  private flagCache = new Map<string, Map<string, Map<string, FlagState>>>();

  // Dedup: track recent flag events to avoid thundering herd
  private recentEvents = new Map<string, number>();
  private readonly DEDUP_TTL = 2_000; // 2 seconds

  constructor() {
    super();
    this.setMaxListeners(50);
    this.mailService = getMailService();
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------

  /**
   * Set specific flags on a single message.
   * Updates IMAP, local cache, and broadcasts via WS.
   */
  async setFlags(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uid: string,
    flags: string[],
    action: 'add' | 'remove' | 'set',
  ): Promise<void> {
    const dedupKey = `${userId}:${mailbox}:${uid}:${action}:${flags.join(',')}`;
    if (this.isDedupHit(dedupKey)) return;
    this.recordDedup(dedupKey);

    try {
      if (action === 'add') {
        await this.mailService.addFlags(userId, config, mailbox, uid, flags);
      } else if (action === 'remove') {
        await this.mailService.removeFlags(userId, config, mailbox, uid, flags);
      } else {
        const current = this.getFlagState(userId, mailbox, uid);
        const currentSet = new Set<string>(current?.flags ?? []);
        const targetSet = new Set<string>(flags);

        const toAdd: string[] = [];
        for (const f of flags) {
          if (!currentSet.has(f)) toAdd.push(f);
        }
        const toRemove: string[] = [];
        for (const c of currentSet) {
          if (!targetSet.has(c)) toRemove.push(c);
        }

        if (toAdd.length > 0) {
          await this.mailService.addFlags(userId, config, mailbox, uid, toAdd);
        }
        if (toRemove.length > 0) {
          await this.mailService.removeFlags(
            userId,
            config,
            mailbox,
            uid,
            toRemove
          );
        }
      }

      // Update local cache
      this.updateCacheEntry(userId, mailbox, uid, flags, action);

      // Broadcast to connected clients of this user
      this.broadcastFlagChange(userId, mailbox, uid, flags, action);

      auditLogger.info('Flag updated', {
        actor_id: userId,
        metadata: { mailbox, uid, flags, action },
      });

      this.emit('flags:changed', { userId, mailbox, uid, flags, action });
    } catch (err) {
      auditLogger.error('Failed to set flags', {
        actor_id: userId,
        metadata: {
          mailbox,
          uid,
          flags,
          error: (err as Error).message,
        },
      });
      throw err;
    }
  }

  /**
   * Batch flag operation: apply same flag change to multiple messages.
   */
  async batchSetFlags(
    userId: string,
    config: IAccountConfig,
    operations: BatchFlagOperation[],
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const op of operations) {
      for (const uid of op.uids) {
        try {
          await this.setFlags(
            userId,
            config,
            op.mailbox,
            uid,
            op.flags,
            op.action,
          );
          success++;
        } catch {
          failed++;
        }
      }
    }

    auditLogger.info('Batch flag operation completed', {
      actor_id: userId,
      metadata: { success, failed, operations: operations.length },
    });

    return { success, failed };
  }

  /**
   * Convenience: mark messages as read.
   */
  async markRead(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uids: string[],
  ): Promise<void> {
    for (const uid of uids) {
      await this.setFlags(userId, config, mailbox, uid, ['\\Seen'], 'add');
    }
  }

  /**
   * Convenience: mark messages as unread.
   */
  async markUnread(
    userId: string,
    config: IAccountConfig,
    mailbox: string,
    uids: string[],
  ): Promise<void> {
    for (const uid of uids) {
      await this.setFlags(userId, config, mailbox, uid, ['\\Seen'], 'remove');
    }
  }

  /**
   * Get cached flag state for a message.
   */
  getFlagState(
    userId: string,
    mailbox: string,
    uid: string,
  ): FlagState | null {
    return this.getNestedMap(this.flagCache, [userId, mailbox, uid]) ?? null;
  }

  /**
   * Get all flags for a mailbox.
   */
  getMailboxFlags(userId: string, mailbox: string): Map<string, FlagState> {
    const userMap = this.flagCache.get(userId);
    if (!userMap) return new Map();
    return userMap.get(mailbox) || new Map();
  }

  /**
   * Invalidate cache for a mailbox (use after sync).
   */
  invalidateMailboxCache(userId: string, mailbox: string): void {
    const userMap = this.flagCache.get(userId);
    if (userMap) {
      userMap.delete(mailbox);
    }
  }

  /**
   * Invalidate all cache for a user.
   */
  invalidateUserCache(userId: string): void {
    this.flagCache.delete(userId);
  }

  /**
   * Apply externally detected flag changes (from IMAP IDLE or sync).
   */
  applyExternalChange(
    userId: string,
    mailbox: string,
    uid: string,
    newFlags: string[],
  ): void {
    const existing = this.getFlagState(userId, mailbox, uid);

    if (!existing) {
      this.setCacheEntry(userId, mailbox, uid, {
        flags: newFlags,
        parsed: this.normalizeFlags(newFlags),
        lastSynced: Date.now(),
        pending: false,
      });
    } else {
      existing.flags = newFlags;
      existing.parsed = this.normalizeFlags(newFlags);
      existing.lastSynced = Date.now();
      existing.pending = false;
    }

    // Broadcast the change
    this.broadcastFlagChange(userId, mailbox, uid, newFlags, 'set');
  }

  // ----------------------------------------------------------------
  // Cache helpers
  // ----------------------------------------------------------------

  private updateCacheEntry(
    userId: string,
    mailbox: string,
    uid: string,
    flags: string[],
    action: 'add' | 'remove',
  ): void {
    const existing = this.getFlagState(userId, mailbox, uid);

    let currentFlags: string[];
    if (existing) {
      currentFlags = [...existing.flags];
    } else {
      currentFlags = [];
    }

    if (action === 'add') {
      for (const f of flags) {
        if (!currentFlags.includes(f)) {
          currentFlags.push(f);
        }
      }
    } else {
      currentFlags = currentFlags.filter((f) => !flags.includes(f));
    }

    this.setCacheEntry(userId, mailbox, uid, {
      flags: currentFlags,
      parsed: this.normalizeFlags(currentFlags),
      lastSynced: Date.now(),
      pending: false,
    });
  }

  private setCacheEntry(
    userId: string,
    mailbox: string,
    uid: string,
    state: FlagState,
  ): void {
    let userMap = this.flagCache.get(userId);
    if (!userMap) {
      userMap = new Map();
      this.flagCache.set(userId, userMap);
    }

    let mailboxMap = userMap.get(mailbox);
    if (!mailboxMap) {
      mailboxMap = new Map();
      userMap.set(mailbox, mailboxMap);
    }

    mailboxMap.set(uid, state);
  }

  // ----------------------------------------------------------------
  // WebSocket broadcast
  // ----------------------------------------------------------------

  private broadcastFlagChange(
    userId: string,
    mailbox: string,
    uid: string,
    flags: string[],
    action: 'add' | 'remove' | 'set',
  ): void {
    const gateway = getWSGateway();
    if (!gateway) return;

    gateway.sendToUserChannel(userId, 'mail:flags' as any, {
      type: 'MESSAGE_FLAG_CHANGED',
      payload: {
        messageId: uid,
        flags,
        action,
        mailboxId: mailbox,
      },
      timestamp: Date.now(),
    });
  }

  // ----------------------------------------------------------------
  // Dedup helpers
  // ----------------------------------------------------------------

  private isDedupHit(key: string): boolean {
    const ts = this.recentEvents.get(key);
    if (!ts) return false;
    if (Date.now() - ts < this.DEDUP_TTL) return true;

    this.recentEvents.delete(key);
    return false;
  }

  private recordDedup(key: string): void {
    this.recentEvents.set(key, Date.now());

    // Cleanup old entries
    if (this.recentEvents.size > 1000) {
      const now = Date.now();
      for (const [k, ts] of this.recentEvents) {
        if (now - ts > this.DEDUP_TTL) {
          this.recentEvents.delete(k);
        }
      }
    }
  }

  // ----------------------------------------------------------------
  // Flag normalization
  // ----------------------------------------------------------------

  private normalizeFlags(raw: string[]): NormalizedFlags {
    const parsed: NormalizedFlags = {
      seen: false,
      answered: false,
      flagged: false,
      deleted: false,
      draft: false,
      recent: false,
      custom: [],
    };

    for (const flag of raw) {
      switch (flag) {
        case '\\Seen':
          parsed.seen = true;
          break;
        case '\\Answered':
          parsed.answered = true;
          break;
        case '\\Flagged':
          parsed.flagged = true;
          break;
        case '\\Deleted':
          parsed.deleted = true;
          break;
        case '\\Draft':
          parsed.draft = true;
          break;
        case '\\Recent':
          parsed.recent = true;
          break;
        default:
          if (!flag.startsWith('\\')) {
            parsed.custom.push(flag);
          }
      }
    }

    return parsed;
  }

  // ----------------------------------------------------------------
  // Utility: safe nested map access
  // ----------------------------------------------------------------

  private getNestedMap<K1, K2, K3, V>(
    map: Map<K1, Map<K2, Map<K3, V>>>,
    keys: [K1, K2, K3],
  ): V | undefined {
    const l1 = map.get(keys[0]);
    if (!l1) return undefined;
    const l2 = l1.get(keys[1]);
    if (!l2) return undefined;
    return l2.get(keys[2]);
  }

  // ----------------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------------

  destroy(): void {
    this.recentEvents.clear();
    this.flagCache.clear();
    this.removeAllListeners();
  }
}

// ------------------------------------------------------------------
// Singleton
// ------------------------------------------------------------------
let _flagSync: FlagSyncService | null = null;

export function getFlagSyncService(): FlagSyncService {
  if (!_flagSync) {
    _flagSync = new FlagSyncService();
  }
  return _flagSync;
}

export function resetFlagSyncService(): void {
  if (_flagSync) {
    _flagSync.destroy();
    _flagSync = null;
  }
}