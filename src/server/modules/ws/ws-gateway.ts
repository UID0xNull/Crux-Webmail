// ============================================================================
// Crux-Webmail — WebSocket Gateway
// ============================================================================
// Gestor central de conexiones WS: handshake, JWT validation, session
// tracking, heartbeat, broadcast a usuarios/grupos. Cumple Zero-Trust:
// todo upgrade requiere validación de token antes de autorizar la conexión.
// ============================================================================

import WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { auditLogger } from '@utils/audit-logger';
import { getRedis } from 'cache/redis-client';
import type { WSServerMessage, WSChannel } from 'types/ws.types';
import { createServerMessage } from 'types/ws.types';

export interface WSClient {
  id: string;
  userId: string;
  sessionId: string;
  channels: Set<string>;
  connectedAt: number;
  lastPing: number;
  remoteAddress: string;
  userAgent: string;
}

declare module 'ws' {
  // Attach internal client metadata to the WS object.
  interface WebSocket {
    __cruxClient?: WSClient;
  }
}

// ------------------------------------------------------------------
// Gateway — per-connection state & messaging
// ------------------------------------------------------------------
export class WSGateway {
  private clients = new Map<string, WSClient>();
  // Per-user → Set of WebSocket refs for multi-tab support
  private userSockets = new Map<string, Set<WebSocket>>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatMs = 30_000; // 30s
  private maxIdleMs = 75_000; // 75s → consider disconnect
  private fastifyRef: FastifyInstance | null = null;

  constructor(fastify: FastifyInstance) {
    this.fastifyRef = fastify;
    this.startHeartbeat();
    auditLogger.info('[WS-Gateway] Initialized');
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.checkStaleConnections();
    }, this.heartbeatMs);
    if (typeof setImmediate !== 'undefined') {
      (this.heartbeatInterval as any).unref?.();
    }
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Notify all clients of shutdown
    for (const [, userSet] of this.userSockets) {
      for (const ws of userSet.values()) {
        const shutdownMsg = createServerMessage('DISCONNECTED', { reason: 'server_shutdown' });
        this.safeSend(ws, shutdownMsg);
      }
    }

    this.clients.clear();
    auditLogger.info('[WS-Gateway] Stopped');
  }

  // ----------------------------------------------------------------
  // Connection registration (after JWT handshake)
  // ----------------------------------------------------------------
  registerClient(
    ws: WebSocket,
    userId: string,
    sessionId: string,
    _req?: { raw?: { url?: string; headers?: Record<string, string | string[]> } }
  ): string {
    const toStr = (v: unknown) =>
      Array.isArray(v)
        ? String(v[0] ?? '')
          : typeof v === 'string'
              ? v
              : '';
    const clientId = `${userId}:${sessionId}:${Date.now()}`;

    const client: WSClient = {
      id: clientId,
      userId,
      sessionId,
      channels: new Set(),
      connectedAt: Date.now(),
      lastPing: Date.now(),
      remoteAddress:
        toStr(_req?.raw?.headers?.['x-forwarded-for']) || 'unknown',
      userAgent:
        toStr(_req?.raw?.headers?.['user-agent']) || 'unknown',
    };

    // Store WebSocket ref in per-user set (multi-tab support)
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(ws);

    // Map WebSocket → client data (attached to ws for quick lookup)
    ws.__cruxClient = client;
    this.clients.set(clientId, client);

    // Register with Redis PubSub for multi-instance
    this.registerToRedis(ws, userId);

    auditLogger.info('[WS] Client registered', {
      actor_id: userId,
      metadata: {
        clientCount: this.clients.size,
        userId,
        sessionId,
      },
    });

    // Send READY confirmation
    this.safeSend(ws, createServerMessage('READY', {
      clientId,
      userId,
      channels: [],
      heartbeatMs: this.heartbeatMs,
    }));

    return clientId;
  }

  // ----------------------------------------------------------------
  // Disconnect handling
  // ----------------------------------------------------------------
  async handleDisconnect(ws: WebSocket): Promise<void> {
    const client = ws.__cruxClient;
    if (!client) return;

    // Remove from per-user socket set
    const userSet = this.userSockets.get(client.userId);
    if (userSet) {
      userSet.delete(ws);
      if (userSet.size === 0) {
        this.userSockets.delete(client.userId);
      }
    }
    // Unsubscribe from Redis
    this.unregisterFromRedis(client.userId);

    // Invalidate idle pool connections (optional cleanup) [non-critical]
    try {
      const { getMailConnectionManager } = await import('modules/mail/connection-manager');
      const connMgr: any = getMailConnectionManager();
      if (connMgr?.disconnectAll) {
        await connMgr.disconnectAll();
      }
    } catch {
      // Non-critical — pool cleanup can happen lazily
    }

    auditLogger.info('[WS] Client disconnected', {
      actor_id: client.userId,
      metadata: {
        clientId: client.id,
        durationMs: Date.now() - client.connectedAt,
      },
    });
  }

  // ----------------------------------------------------------------
  // Subscribe / Unsubscribe to channels
  // ----------------------------------------------------------------
  subscribe(ws: WebSocket, channels: WSChannel[]): void {
    const client = ws.__cruxClient;
    if (!client) return;

    for (const ch of channels) {
      client.channels.add(ch);
      this.subscribeRedisChannel(client.userId, ch);
    }

    auditLogger.debug('[WS] Channels subscribed', {
      actor_id: client.userId,
      metadata: { channels },
    });
  }

  unsubscribe(ws: WebSocket, channels: WSChannel[]): void {
    const client = ws.__cruxClient;
    if (!client) return;

    for (const ch of channels) {
      client.channels.delete(ch);
      this.unsubscribeRedisChannel(client.userId, ch);
    }
  }

  // ----------------------------------------------------------------
  // Messaging
  // ----------------------------------------------------------------
  safeSend(ws: WebSocket, data: WSServerMessage | Record<string, unknown>): void {
    if (!ws || ws.readyState !== 1) return; // OPEN only

    try {
      ws.send(JSON.stringify(data));
    } catch (err) {
      auditLogger.error('[WS] Send failed', {
        error: (err as Error).message,
      });
    }
  }

  // Send to all WS connections of a specific user (multi-tab)
  sendToUser(userId: string, message: WSServerMessage): void {
    const userSet = this.userSockets.get(userId);
    if (!userSet) return;

    for (const ws of userSet.values()) {
      this.safeSend(ws, message);
    }
  }

  // Send to a specific user + channel (only if subscribed)
  sendToUserChannel(
    userId: string,
    channel: WSChannel,
    message: WSServerMessage
  ): void {
    for (const [, client] of this.clients) {
      if (client.userId === userId && client.channels.has(channel)) {
        const userSet = this.userSockets.get(userId);
        if (userSet) {
          for (const ws of userSet.values()) {
            this.safeSend(ws, message);
          }
        }
      }
    }
  }

  // Send message to all WS connections of a user except the sender
  sendToOtherClientSockets(
    userId: string,
    senderWs: WebSocket,
    message: WSServerMessage
  ): void {
    const userSet = this.userSockets.get(userId);
    if (!userSet) return;
    for (const ws of Array.from(userSet.values())) {
      if (ws !== senderWs && ws.readyState === WebSocket.OPEN) {
        this.safeSend(ws, message);
      }
    }
  }

  // Broadcast to ALL connected clients (admin/system events) — typed via WSServerMessage
  broadcast(message: WSServerMessage): void {
    for (const [, userSet] of this.userSockets) {
      for (const ws of userSet.values()) {
        this.safeSend(ws, message);
      }
    }
  }

  // ----------------------------------------------------------------
  // Heartbeat / Stale detection
  // ----------------------------------------------------------------
  checkStaleConnections(): void {
    const now = Date.now();
    for (const [, client] of this.clients) {
      if (now - client.lastPing > this.maxIdleMs) {
        // Warn before disconnect
        this.sendToUser(
          client.userId,
          createServerMessage('CONNECTION_WARNING', {
            message: 'Connection idle — please keep alive with ping.',
            disconnectIn: 15_000,
          })
        );
      }
    }
  }

  updatePing(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPing = Date.now();
    }
  }

  // ----------------------------------------------------------------
  // Stats
  // ----------------------------------------------------------------
  getStats(): { total: number; byUser: Record<string, number> } {
    const byUser: Record<string, number> = {};
    for (const [, client] of this.clients) {
      byUser[client.userId] = (byUser[client.userId] || 0) + 1;
    }
    return { total: this.clients.size, byUser };
  }

  getClientsByUserId(userId: string): WebSocket[] {
    const wss: WebSocket[] = [];
    for (const [, client] of this.clients) {
      if (userId === '*' || client.userId === userId) {
        this.getClientWebSocket(client.id)?.forEach((ws) => wss.push(ws));
      }
    }
    return wss;
  }

  // ----------------------------------------------------------------
  // Redis Pub/Sub integration
  // ----------------------------------------------------------------
  private async registerToRedis(ws: WebSocket, userId: string): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;

      await redis.publish(
        `ws:registry:${userId}`,
        JSON.stringify({ action: 'register', timestamp: Date.now() })
      );
    } catch {
      auditLogger.warn('[WS-Redis] Registry publish failed (non-critical)');
    }
  }

  private async subscribeRedisChannel(userId: string, channel: string): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;

      await redis.publish(
        `ws:notify:${userId}`,
        JSON.stringify({
          event: 'subscribe',
          channel,
          timestamp: Date.now(),
        })
      );
    } catch {
      // Non-critical
    }
  }

  private async unsubscribeRedisChannel(userId: string, channel: string): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;

      await redis.publish(
        `ws:notify:${userId}`,
        JSON.stringify({
          event: 'unsubscribe',
          channel,
          timestamp: Date.now(),
        })
      );
    } catch {
      // Non-critical
    }
  }

  private async unregisterFromRedis(userId: string): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;

      await redis.publish(
        `ws:notify:${userId}`,
        JSON.stringify({
          event: 'unregister',
          timestamp: Date.now(),
        })
      );
    } catch {
      // Non-critical
    }
  }

  // ----------------------------------------------------------------
  // Helper: get client metadata from a WebSocket
  getClient(ws: WebSocket): WSClient | null {
    return ws.__cruxClient ?? null;
  }

  // Broadcast to all WS connections of the same user except one specific connection.
  broadcastToOtherClientsOfUser(
    userId: string,
    excludeWs: WebSocket,
    message: WSServerMessage
  ): void {
    const userSet = this.userSockets.get(userId);
    if (!userSet) return;
    for (const ws of userSet.values()) {
      if (ws !== excludeWs && ws.readyState === 1) {
        this.safeSend(ws, message);
      }
    }
  }

  private getClientWebSocket(clientId: string): Set<WebSocket> | null {
    const result = new Set<WebSocket>();
    for (const [id, client] of this.clients) {
      if (clientId === '*' || id === clientId) {
        const set = this.userSockets.get(client.userId);
        if (set) {
          for (const ws of set.values()) result.add(ws);
        }
      }
    }
    return result.size > 0 ? result : null;
  }
}

// ------------------------------------------------------------------
// Singleton
// ------------------------------------------------------------------
let _gateway: WSGateway | null = null;

export function getWSGateway(): WSGateway | null {
  return _gateway;
}

export function initWSGateway(fastify: FastifyInstance): WSGateway {
  if (!_gateway) {
    _gateway = new WSGateway(fastify);
  }
  return _gateway;
}

export function resetWSGateway(): void {
  if (_gateway) {
    void _gateway.stop();
    _gateway = null;
  }
}