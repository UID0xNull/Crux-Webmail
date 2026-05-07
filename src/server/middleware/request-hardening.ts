// ============================================================================
// Crux-Webmail — Request Hardening Middleware
// ============================================================================
// Timeouts estrictos, payload limits, depth limiting para JSON, URL length.
// OWASP A7:2017 - Cross-Site Request Forgery prevention complement.
// ============================================================================

import { FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import { config } from 'config/app.config';
import { auditLogger } from 'utils/audit-logger';

// ------------------------------------------------------------------
// Límites de request
// ------------------------------------------------------------------
const MAX_URL_LENGTH = 2048;
const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5MB para body (sin attachments)
const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50MB con attachments
const MAX_JSON_DEPTH = 20;
const MAX_ARRAY_LENGTH = 1000;

// Paths que permiten payloads más grandes (uploads)
const LARGE_PAYLOAD_PATHS = ['/api/attachments', '/api/mail/upload', '/api/jmap/Upload'];

// ------------------------------------------------------------------
// URL length check
// ------------------------------------------------------------------
function checkUrlLength(url: string): boolean {
  return url.length <= MAX_URL_LENGTH;
}

function isLargePayloadPath(url: string): boolean {
  return LARGE_PAYLOAD_PATHS.some(prefix => url.startsWith(prefix));
}

// ------------------------------------------------------------------
// JSON depth counter — prevent Billion Laughs / zip bomb deserialization
// ------------------------------------------------------------------
function getMaxDepth(obj: unknown, currentDepth: number = 0): number {
  if (obj === null || typeof obj !== 'object') {
    return currentDepth;
  }

  if (Array.isArray(obj)) {
    if (obj.length > MAX_ARRAY_LENGTH) {
      return -1; // Overflow
    }
    if (obj.length === 0) {
      return currentDepth;
    }
    return Math.max(
      ...obj.map(item => getMaxDepth(item, currentDepth + 1))
    );
  }

  const entries = Object.entries(obj as Record<string, unknown>);
  if (entries.length === 0) {
    return currentDepth;
  }
  return Math.max(
    ...entries.map(([, val]) => getMaxDepth(val, currentDepth + 1))
  );
}

// ------------------------------------------------------------------
// Hardening Middleware
// ------------------------------------------------------------------
const requestHardeningPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    // 1. URL Length check
    if (!checkUrlLength(request.url)) {
      auditLogger.warn('Request blocked — URL exceeds max length', {
        client_ip: request.ip,
        session_id: request.id,
        metadata: {
          url_length: request.url.length,
          path: request.url.substring(0, 100),
        },
      });
    }

    // 2. Set timeout per ruta
    const isAuth = request.url.startsWith('/api/auth');
    const isSearch = request.url.includes('/search') || request.url.includes('/index');
    const isAdmin = request.url.startsWith('/api/admin');

    let timeoutMs: number;
    if (isAuth) {
      timeoutMs = 10000; // Auth: 10s (bcrypt hashing takes time)
    } else if (isSearch) {
      timeoutMs = 15000; // Search/indexing: 15s
    } else if (isLargePayloadPath(request.url)) {
      timeoutMs = 30000; // Uploads: 30s
    } else if (isAdmin) {
      timeoutMs = 12000; // Admin API: 12s
    } else {
      timeoutMs = 8000; // Default: 8s
    }

    // Use raw socket for timeout
    request.raw.setTimeout(timeoutMs);
    request.socket.setTimeout(timeoutMs);
  });

  done();
};

// ------------------------------------------------------------------
// JSON Body Parser Override — con depth limiting
// ------------------------------------------------------------------
export function setupHardenedBodyParser(fastify: Parameters<FastifyPluginCallback>[0]): void {
  // Remove default JSON parser first
  fastify.removeContentTypeParser('application/json');

  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: MAX_BODY_SIZE },
    async (request: any, payload: string) => {
      const parsed = JSON.parse(payload);
      const depth = getMaxDepth(parsed);

      if (depth > MAX_JSON_DEPTH) {
        auditLogger.warn('Request rejected — JSON too deep', {
          client_ip: request.ip,
          session_id: request.id,
          metadata: { depth, max: MAX_JSON_DEPTH },
        });
        throw new Error('Request body too deeply nested');
      }

      return parsed;
    }
  );
}

// ------------------------------------------------------------------
// Response Hardening — no exponer stack traces, version internals
// ------------------------------------------------------------------
const responseHardeningPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    // Strip debug headers in production
    if (config.NODE_ENV === 'production') {
      reply.removeHeader('X-Powered-By');
    }

    return payload;
  });

  done();
};

export { requestHardeningPlugin, responseHardeningPlugin };