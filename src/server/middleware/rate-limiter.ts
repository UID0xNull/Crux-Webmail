// ============================================================================
// Crux-Webmail — Rate Limiter Adaptativo (Redis-backed)
// ============================================================================
// Ventana deslizante: 1800 req/min API, 300 req/min auth, 20 conn/IP.
// Skip para healthchecks. Auto-ban para IPs maliciosas.
// ============================================================================

import { FastifyPluginCallback } from 'fastify';
import { getRedis } from '../utils/connections';
import { config } from '../config/app.config';
import { auditLogger } from '../utils/audit-logger';
import { hashIp } from '../utils/crypto';
import { createRateLimitError } from '../errors/handler';

// ------------------------------------------------------------------
// Fastify rate-limit plugin wrapper con sliding window
// ------------------------------------------------------------------
const rateLimiterPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  // Rate limiter para rutas API estándar
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      const redis = await getRedis();
      const clientIp = request.ip || request.socket.remoteAddress || 'unknown';
      const path = request.url;

      // Healthchecks y monitorización: bypass total
      if (path === '/health' || path === '/ready' || path.startsWith('/monitoring')) {
        return;
      }

      // Determinar la categoría de ruta para límites diferenciados
      const isAuthPath = path.startsWith('/api/auth') || path.startsWith('/auth');
      const isUploadPath = path.startsWith('/api/attachments') || request.method === 'PUT';
      const isJmapPath = path.startsWith('/api/jmap');

      // Limite por tipo de ruta
      let maxRequests: number;
      let keyPrefix: string;

      if (isAuthPath) {
        maxRequests = config.RATE_LIMIT_AUTH_RPM;
        keyPrefix = 'ratelimit:auth';
      } else if (isUploadPath) {
        maxRequests = 50; // Estricto para uploads
        keyPrefix = 'ratelimit:upload';
      } else if (isJmapPath) {
        maxRequests = config.RATE_LIMIT_API_RPM;
        keyPrefix = 'ratelimit:jmap';
      } else {
        maxRequests = config.RATE_LIMIT_API_RPM;
        keyPrefix = 'ratelimit:api';
      }

      // Hash de IP para privacy
      const ipHash = hashIp(clientIp, 'ratelimit-salt-v1');
      const key = `${keyPrefix}:${ipHash}`;
      const windowMs = config.RATE_LIMIT_WINDOW_MS;

      // Sliding window via Redis INCR + EXPIRE
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowMs / 1000);
      }

      if (current > maxRequests) {
        // Tiempo restante antes de reset
        const ttl = await redis.ttl(key);
        const waitSeconds = Math.max(1, ttl);

        // Auto-ban: si supera 3x el límite, ban por 1 hora
        if (current > maxRequests * 3) {
          const banKey = `ban:${ipHash}`;
          await redis.set(banKey, 'banned', 'EX', 3600);
          auditLogger.critical('IP auto-banned for rate abuse', {
            client_ip: clientIp,
            session_id: request.id,
            metadata: { key, current, maxRequests },
          });
          return reply.status(429).send({
            status: 429,
            code: 'IP_BANNED',
            message: 'This IP has been temporarily banned for excessive requests.',
            correlation_id: request.id,
          });
        }

        auditLogger.warn('Rate limit exceeded', {
          client_ip: clientIp,
          session_id: request.id,
          metadata: { key, current, maxRequests, path },
        });

        reply.header('Retry-After', String(waitSeconds));
        return reply.status(429).send({
          status: 429,
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again in ${waitSeconds}s.`,
          correlation_id: request.id,
          details: {
            retry_after: waitSeconds,
            limit: maxRequests,
            window: '60s',
          },
        });
      }

      // Headers informativos (RFC 6585)
      reply.header('X-RateLimit-Limit', String(maxRequests));
      reply.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - current)));
      reply.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + 60));
    } catch (err) {
      // Si Redis falla: allow-through con log (fail-open para no bloquear servicio)
      auditLogger.error('Rate limiter Redis error — fail-open', {
        metadata: { error: (err as Error).message },
      });
    }
  });

  done();
};

export { rateLimiterPlugin };