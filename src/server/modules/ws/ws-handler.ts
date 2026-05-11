// ============================================================================
// Crux-Webmail — WebSocket Route Handler
// ============================================================================
// Maneja el lifecycle de cada conexión WS: upgrade → auth → subscribe →
// mensaje relay. Integrado con @fastify/websocket.
// ============================================================================

import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { getWSGateway, initWSGateway } from './ws-gateway';
import { auditLogger } from 'utils/audit-logger';
import type { WSClientMessage, WSServerMessage, WSChannel } from 'shared/types';

// ------------------------------------------------------------------
// WebSocket upgrade handler — Fastify plugin
// ------------------------------------------------------------------
export async function registerWebSocketRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(import('@fastify/websocket') as any);

  // Route: /ws
  fastify.route<{
    Querystring: never;
    Params: never;
  }>({
    method: 'GET',
    url: '/ws',
    websocket: true,
    async handler(request: unknown, reply: { send(): void }) {
      const rawRequest = request as RawWSRequest & Record<string, unknown>;
      const ws = (rawRequest.websocket) as WebSocket;
      handleConnection(ws, rawRequest);
      return reply.send();
    },
  });

  auditLogger.info('[WS] Routes registered');
}

// ------------------------------------------------------------------
// Connection lifecycle
// ------------------------------------------------------------------

interface RawWSRequest {
  raw?: { url?: string; headers?: Record<string, string | string[]> };
}

async function handleConnection(ws: WebSocket, req: RawWSRequest): Promise<void> {  // Guard: prevent crashes from premature disconnect
  let connected = true;
  ws.once('close', () => { connected = false; });

  try {
    // ---- Step 1: Wait for AUTH message from client ----
    ws.once('message', async (raw) => {
      let msg: WSClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.close(1008, 'Invalid JSON');
        return;
      }

      if (msg.type !== 'AUTH') {
        ws.close(1008, 'First message must be AUTH');
        return;
      }

      // ---- Step 2: Validate JWT ----
      const payload = msg.payload as { token: string; sessionId: string };
      if (!payload.token || !payload.sessionId) {
        ws.close(1008, 'Missing token or sessionId');
        return;
      }

      let userId: string | null = null;
      try {
        const sessionManager = (await import('../auth/session-manager')).getSessionManager();
        const result = await sessionManager.verifySession(payload.token);

        if (!result.valid || result.session_id !== payload.sessionId) {
          ws.close(1008, 'Invalid session');
          return;
        }

        userId = result.user_id;
      } catch (err) {
        auditLogger.warn('[WS] Auth verification failed', {
          error: (err as Error).message,
        });
        ws.close(1008, 'Authentication error');
        return;
      }

      // ---- Step 3: Register client ----
      const gateway = getWSGateway() || initWSGateway(fastify);
      const clientId = gateway.registerClient(ws, userId!, payload.sessionId, req);

      // ---- Step 4: Listen for further messages ----
      ws.on('message', (data) => {
        if (!connected) return;
        handleClientMessage(ws, data.toString(), clientId);
      });

      // ---- Step 5: Disconnect cleanup ----
      ws.on('close', async () => {
        await gateway.handleDisconnect(ws);
      });

      ws.on('error', (err) => {
        auditLogger.error('[WS] Connection error', {
          actor_id: userId,
          error: err.message,
        });
      });

      auditLogger.info('[WS] Client authenticated and connected', {
        actor_id: userId,
      });
    });
  } catch (err) {
    if (connected) {
      ws.close(1011, 'Internal server error');
    }
    auditLogger.error('[WS] Connection handler error', {
      error: (err as Error).message,
    });
  }
}

// ------------------------------------------------------------------
// Message routing (Client → Gateway)
// ------------------------------------------------------------------
function handleClientMessage(ws: WebSocket, raw: string, clientId: string): void {
  const gateway = getWSGateway();
  if (!gateway) return;

  let msg: WSClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    gateway.safeSend(ws, {
      type: 'ERROR',
      payload: { message: 'Invalid JSON' },
      timestamp: Date.now(),
    } satisfies WSServerMessage);
    return;
  }

  // Validate message type
  const validTypes = ['PING', 'SUBSCRIBE', 'UNSUBSCRIBE', 'FLAG_UPDATE', 'FOLDER_SYNC'];
  if (!validTypes.includes(msg.type)) {
    gateway.safeSend(ws, {
      type: 'ERROR',
      payload: { message: `Unknown message type: ${msg.type}` },
      timestamp: Date.now(),
    } satisfies WSServerMessage);
    return;
  }

  switch (msg.type) {
    case 'PING':
      gateway.updatePing(clientId);
      gateway.safeSend(ws, {
        type: 'PONG',
        payload: { timestamp: Date.now() },
        timestamp: Date.now(),
      } satisfies WSServerMessage);
      break;

    case 'SUBSCRIBE': {
      const channels = (msg.payload as { channels: WSChannel[] }).channels;
      if (channels && Array.isArray(channels)) {
        gateway.subscribe(ws, channels);

        // Confirm subscription
        gateway.safeSend(ws, {
          type: 'READY',
          payload: { subscribed: channels },
          timestamp: Date.now(),
        } satisfies WSServerMessage);
      }
      break;
    }

    case 'UNSUBSCRIBE': {
      const channels = (msg.payload as { channels: WSChannel[] }).channels;
      if (channels && Array.isArray(channels)) {
        gateway.unsubscribe(ws, channels);
      }
      break;
    }

    case 'FLAG_UPDATE': {
      const client = gateway.getClient(ws);
      if (!client) return;

      const { messageId, flags, action, mailboxId } = (msg.payload || {}) as {
        messageId: string;
        flags: string[];
        action: 'add' | 'remove';
        mailboxId?: string;
      };

      gateway.broadcastToOtherClientsOfUser(client.userId, ws, {
        type: 'MESSAGE_FLAG_CHANGED',
        payload: {
          messageId,
          flags,
          action,
          mailboxId: mailboxId ?? client.sessionId, // fallback only when missing in payload
        },
        timestamp: Date.now(),
      } satisfies WSServerMessage);
      break;
    }
    default:
      auditLogger.debug('[WS] Ignored message type', {
        metadata: { type: msg.type },
      });
  }
}

// ------------------------------------------------------------------
// Helper: no-op stub; multi-node bridging handled by Redis PubSub
// ------------------------------------------------------------------
function findWsForClient(_gateway: WSGateway, _client: WSClient): WebSocket | null {
  return null;
}