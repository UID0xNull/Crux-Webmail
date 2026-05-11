// ============================================================================
// Crux-Webmail — WebSocket Bridge (Mail Events → WS Relay)
// ============================================================================

import { getWSGateway, WSGateway } from './ws-gateway';
import { auditLogger } from 'utils/audit-logger';
import { getWSGateway } from './ws-gateway';

interface RateLimiterEntry { count: number; lastReset: number; }

class EventRateLimiter {
  private buckets = new Map<string, RateLimiterEntry>();
  private readonly cooldownMs = 5000;
  private readonly maxEvents = 20;

  shouldThrottle(userId: string, eventKey: string): boolean {
    const key = `${userId}:${eventKey}`;
    const now = Date.now();
    const entry = this.buckets.get(key);
    if (!entry || now - entry.lastReset > this.cooldownMs) {
      this.buckets.set(key, { count: 1, lastReset: now });
      return false;
    }
    entry.count++;
    return entry.count > this.maxEvents;
  }
}

export class WSBridge {
  private rateLimiter = new EventRateLimiter();
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this.setupRedisListener();
    auditLogger.info('[WS-Bridge] Initialized');
  }

  async publish(event: MailEventPayload): Promise<void> {
    if (this.rateLimiter.shouldThrottle(event.userId, event.type)) return;

    const gateway = getWSGateway();
    if (gateway) this.dispatchToLocal(gateway, event);
    await this.publishToRedis(event);
    await this.cacheForReconnect(event);
  }

  private dispatchToLocal(gateway: WSGateway, event: MailEventPayload): void {
    const ts = Date.now();

    const makeMessage = (type: string, payload = event.data): WSServerMessage => ({
      type,
      payload,
      timestamp: ts,
    });

    switch (event.type) {
      case 'new':
        this.sendToUser(gateway, event.userId, makeMessage('NEW_MESSAGE'));
        this.sendToUser(gateway, event.userId, makeMessage('FOLDER_COUNTS_UPDATED'));
        break;
      case 'flagged':
        this.sendToUser(gateway, event.userId, makeMessage('MESSAGE_FLAG_CHANGED'));
        break;
      case 'deleted':
        this.sendToUser(gateway, event.userId, makeMessage('MESSAGE_DELETED'));
        this.sendToUser(gateway, event.userId, makeMessage('FOLDER_COUNTS_UPDATED'));
        break;
      case 'synced':
        this.sendToUser(gateway, event.userId, makeMessage('SYNC_STATUS'));
        break;
      case 'moved':
        this.sendToUser(gateway, event.userId, makeMessage('MESSAGE_FLAG_CHANGED', {
          ...event.data,
          eventType: 'move',
        }));
        this.sendToUser(gateway, event.userId, makeMessage('FOLDER_COUNTS_UPDATED'));
        break;
    }
  }

  private async publishToRedis(event: MailEventPayload): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;
      await redis.publish(`crux:ws:events:${event.userId}`, JSON.stringify(event));
    } catch { auditLogger.warn('[WS-Bridge] Redis publish failed'); }
  }

  private async setupRedisListener(): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;
      const subscriber = redis.duplicate();
      await subscriber.connect();
      await subscriber.psubscribe('crux:ws:events:*');
      subscriber.on('pmessage', async (_p: string, _ch: string, msg: string) => {
        try {
          const ev = JSON.parse(msg) as MailEventPayload;
          const gw = getWSGateway();
          if (gw) this.dispatchToLocal(gw, ev);
        } catch { /* ignore */ }
      });
      auditLogger.info('[WS-Bridge] Redis subscriber connected');
    } catch { auditLogger.warn('[WS-Bridge] Redis listener failed (non-critical)'); }
  }

  private async cacheForReconnect(event: MailEventPayload): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;
      const key = `crux:ws:recent:${event.userId}`;
      await redis.lpush(key, JSON.stringify(event));
      await redis.ltrim(key, 0, 49);
      await redis.expire(key, 300);
    } catch { /* non-critical */ }
  }

  private sendToUser(gateway: WSGateway, userId: string, msg: WSServerMessage): void {
    gateway.sendToUser?.(userId, msg);
  }
}

let _bridge: WSBridge | null = null;
export function getWSBridge(): WSBridge {
  if (!_bridge) { _bridge = new WSBridge(); void _bridge.init(); }
  return _bridge;
}