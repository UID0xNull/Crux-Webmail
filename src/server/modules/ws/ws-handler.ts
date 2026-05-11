// ============================================================================
// Crux-Webmail — WebSocket Route Handler
// ============================================================================
// Maneja el lifecycle de cada conexión WS: upgrade → auth → subscribe →
// mensaje relay. Integrado con @fastify/websocket.
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type WebSocket from 'ws';
import { getWSGateway, initWSGateway } from 'modules/ws/ws-gateway';
import { auditLogger } from 'utils/audit-logger';
import type { WSClientMessage, WSServerMessage, WSChannel, WSFlagUpdatePayload } from 'shared/types';

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
      const ws = (rawRequest.websocket as WebSocket);
      handleConnection(ws, fastify, rawRequest);
      return reply.send();
    },
  });

  auditLogger.info('[WS] Routes registered');
}

// ------------------------------------------------------------------
// Connection lifecycle
// ------------------------------------------------------------------

interface RawWSRequest {
  websocket: WebSocket | null;
  raw?: { url?: string; headers?: Record<string, string | string[]> };
}

async function handleConnection(
  ws: WebSocket,
  fastifyInstance: FastifyInstance,
  req: RawWSRequest
): Promise<void> {
  // Guard: prevent crashes from premature disconnect
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

      // ---- Step 2: Validate JWT via session manager ----
      const payload = msg.payload as { token?: string; sessionId?: string };
      if (!payload.token || !payload.sessionId) {
        ws.close(1008, 'Missing token or sessionId');
        return;
      }

      let userId: string | null = null;
      try {
        const sessionManager = (await import('auth/session-manager')).getSessionManager();
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

      // ---- Step 3: Register client in gateway ----
      const gateway = getWSGateway() ?? initWSGateway(fastifyInstance);
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
    });
    return;
  }

  // Validate message type (allow only known WS client event types)
  const validTypes = ['PING', 'SUBSCRIBE', 'UNSUBSCRIBE', 'FLAG_UPDATE', 'FOLDER_SYNC'] as const;
  if (!(validTypes as readonly string[]).includes(msg.type)) {
    gateway.safeSend(ws, {
      type: 'ERROR',
      payload: { message: `Unknown message type: ${msg.type}` },
      timestamp: Date.now(),
    });
    return;
  }

  switch (msg.type) {
    case 'PING':
      gateway.updatePing(clientId);
      gateway.safeSend(ws, {
        type: 'PONG',
        payload: { timestamp: Date.now() },
        timestamp: Date.now(),
      });
      break;

    case 'SUBSCRIBE': {
      const channels = (msg.payload as { channels?: WSChannel[] }).channels;
      if (channels && Array.isArray(channels)) {
        gateway.subscribe(ws, channels);

        // Confirm subscription using WSServerMessage type-safe form
        gateway.safeSend(ws, {
          type: 'READY',
          payload: { subscribed: channels },
          timestamp: Date.now(),
        });
      }
      break;
    }

    case 'UNSUBSCRIBE': {
      const channels = (msg.payload as { channels?: WSChannel[] }).channels;
      if (channels && Array.isArray(channels)) {
        gateway.unsubscribe(ws, channels);
      }
      break;
    }

    case 'FLAG_UPDATE': {
      const client = gateway.getClient(ws);
      if (!client) return;

      const { messageId, flags, action, mailboxId } = (msg.payload as WSFlagUpdatePayload & {
        mailboxId?: string;
      }) ?? {};

      // Use shared broadcast method and typed message.
      gateway.broadcastToOtherClientsOfUser(client.userId, ws, {
        type: 'MESSAGE_FLAG_CHANGED',
        payload: {
          messageId,
          flags,
          action,
          mailboxId: mailboxId ?? client.sessionId,
        },
        timestamp: Date.now(),
      });
      break;
    }

    case 'FOLDER_SYNC':
      // Intended for folder sync handshake/coordination (handled by dedicated service).
      gateway.updatePing(clientId);
      auditLogger.debug('[WS] FOLDER_SYNC handled', { metadata: { type: msg.type } });
      break;

    default:
      auditLogger.debug('[WS] Ignored message type', {
        metadata: { type: msg.type },
      });
  }
}