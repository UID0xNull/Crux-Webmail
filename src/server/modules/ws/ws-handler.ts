// ============================================================================
// Crux-Webmail — WebSocket Route Handler
// ============================================================================
// Maneja el lifecycle de cada conexión WS: upgrade → auth → subscribe →
// mensaje relay. Integrado con @fastify/websocket.
// ============================================================================

import type { FastifyInstance } from 'fastify';
import type WebSocket from 'ws';
import { getWSGateway, initWSGateway, WSGateway } from './ws-gateway';
import { auditLogger } from '@utils/audit-logger';
import type { WSClientMessage, WSServerMessage, WSChannel } from 'types/ws.types';

// Fastify/WebSocket-specific shape for the upgrade handler.
type RawWSRequest = {
  websocket: WebSocket | null;
  raw?: {
    url?: string;
    headers?: Record<string, string | string[]>;
  };
};

// ------------------------------------------------------------------
// WebSocket upgrade handler — Fastify plugin
// ------------------------------------------------------------------
export async function registerWebSocketRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(import('@fastify/websocket') as any);

  fastify.route<{
    Querystring: never;
    Params: never;
  }>({
    method: 'GET',
    url: '/ws',
    websocket: true,
    async handler(request: unknown) {
      const rawRequest = request as RawWSRequest;
      const ws = (rawRequest.websocket as WebSocket);
      handleConnection(ws, fastify, rawRequest);
    },
  });

  auditLogger.info('[WS] Routes registered');
}

// ------------------------------------------------------------------
// Connection lifecycle
// ------------------------------------------------------------------
async function handleConnection(
  ws: WebSocket,
  fastifyInstance: FastifyInstance,
  req: RawWSRequest,
): Promise<void> {
  let connected = true;
  ws.once('close', () => { connected = false; });

  try {
    // Step 1: Wait for AUTH message from client
    ws.once('message', async (raw) => {
      let msg: WSClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        closeIf(ws, connected, 1008, 'Invalid JSON');
        return;
      }

      if (msg.type !== 'AUTH') {
        closeIf(ws, connected, 1008, 'First message must be AUTH');
        return;
      }

      const payload = msg.payload as { token?: string; sessionId?: string };
      if (!payload.token || !payload.sessionId) {
        closeIf(ws, connected, 1008, 'Missing token or sessionId');
        return;
      }

      let userId: string | null = null;
      try {
        const sessionManager = (await import('modules/auth/session-manager')).getSessionManager();
        const result = await sessionManager.verifySession(payload.token);

        if (!result.valid || result.session_id !== payload.sessionId) {
          closeIf(ws, connected, 1008, 'Invalid session');
          return;
        }

        userId = result.user_id;
      } catch (err) {
        auditLogger.warn('[WS] Auth verification failed', {
          error: (err as Error).message,
        });
        closeIf(ws, connected, 1008, 'Authentication error');
        return;
      }

      if (!userId || !connected || ws.readyState !== ws.OPEN) {
        return;
      }

      // Step 2: Register client in gateway using canonical WS type
      const gateway = getWSGateway() ?? initWSGateway(fastifyInstance);
      const clientId = gateway.registerClient(ws, userId!, payload.sessionId, rawRequest as any);

      // Step 3: Listen for further messages
      ws.on('message', (data) => {
        if (!connected) return;
        handleClientMessage(gateway, ws, data.toString(), clientId);
      });

      // Step 4: Disconnect cleanup
      ws.on('close', async () => {
        await gateway.handleDisconnect(ws).catch((err: unknown) => {
          auditLogger.error('[WS] Disconnect handler error', {
            error: (err as Error).message,
          });
        });
      });

      // Step 5: Connection errors
      ws.on('error', (err: unknown) => {
        auditLogger.error('[WS] Connection error', {
          actor_id: userId,
          error: (err as Error).message,
        });
      });

      auditLogger.info('[WS] Client authenticated and connected', {
        actor_id: userId,
      });
    });
  } catch (err) {
    if (connected) {
      closeIf(ws, connected, 1011, 'Internal server error');
    }
    auditLogger.error('[WS] Connection handler error', {
      error: (err as Error).message,
    });
  }
}

function closeIf(
  ws: WebSocket,
  ok: boolean,
  code: number,
  reason?: string,
): void {
  if (!ok || ws.readyState !== ws.OPEN) return;
  try {
    ws.close(code, reason);
  } catch {
    // no-op
  }
}

// ------------------------------------------------------------------
// Message routing (Client → Gateway)
// ------------------------------------------------------------------
function handleClientMessage(
  gateway: WSGateway,
  ws: WebSocket,
  raw: string,
  clientId: string,
): void {

  let msg: WSClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    gateway.safeSend(ws, {
      type: 'ERROR',
      payload: { message: 'Invalid JSON' },
      timestamp: Date.now(),
    } as WSServerMessage);
    return;
  }

  const allowed = new Set<WSClientMessage['type']>([
    'PING',
    'SUBSCRIBE',
    'UNSUBSCRIBE',
    'FLAG_UPDATE',
    'FOLDER_SYNC',
  ]);

  if (!allowed.has(msg.type)) {
    gateway.safeSend(ws, {
      type: 'ERROR',
      payload: { message: `Unknown message type: ${msg.type}` },
      timestamp: Date.now(),
    } as WSServerMessage);
    return;
  }

  switch (msg.type) {
    case 'PING':
      gateway.updatePing(clientId);
      gateway.safeSend(ws, {
        type: 'PONG',
        payload: { timestamp: Date.now() },
        timestamp: Date.now(),
      } as WSServerMessage);
      break;

    case 'SUBSCRIBE': {
      const channels = (msg.payload as { channels?: WSChannel[] }).channels;
      if (channels && Array.isArray(channels)) {
        gateway.subscribe(ws, channels);
        gateway.safeSend(ws, {
          type: 'READY',
          payload: { subscribed: channels },
          timestamp: Date.now(),
        } as WSServerMessage);
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

      const p = msg.payload as Record<string, unknown>;
      const messageId = (p.messageId ?? p.id) as string | undefined;
      const flags = (p.flags ?? []) as unknown[];
      const action = (p.action ?? 'update') as string;
      const mailboxId = (p.mailboxId ?? client.sessionId) as string;

      gateway.broadcastToOtherClientsOfUser(
        client.userId,
        ws,
        {
          type: 'MESSAGE_FLAG_CHANGED',
          payload: {
            messageId,
            flags,
            action,
            mailboxId,
          },
          timestamp: Date.now(),
        } as WSServerMessage,
      );
      break;
    }

    case 'FOLDER_SYNC':
      gateway.updatePing(clientId);
      auditLogger.debug('[WS] FOLDER_SYNC handled');
      break;

    default:
      // Should not happen due to allowed set.
  }
}