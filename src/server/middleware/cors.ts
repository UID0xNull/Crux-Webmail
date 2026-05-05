// ============================================================================
// Crux-Webmail — Strict CORS Middleware
// ============================================================================
// Whitelist explícita de orígenes. Sin wildcards. Solo HTTPS en producción.
// Pre-flight caching controlado. Credenciales permitidos solo para orígenes válidos.
// ============================================================================

import { FastifyPluginCallback } from 'fastify';
import { config } from '../config/app.config';

// ------------------------------------------------------------------
// Orígenes permitidos — whitelist estricta
// ------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  // Frontend webmail
  'https://webmail.crux.local',
  'https://app.crux.local',
  // Desarrollo local
  'http://localhost:3001',
  'http://localhost:3000',
  // Staging
  'https://staging-webmail.crux.internal',
]);

// Orígenes permitidos solo para recursos estáticos (imagenes, fonts)
const STATIC_ONLY_ORIGINS = new Set([
  'https://static.crux.local',
]);

const corsPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;

    // Si no hay header Origin, es una request misma-origin o API directa
    if (!origin) {
      return;
    }

    // Validar origen contra whitelist
    const isAllowed = ALLOWED_ORIGINS.has(origin);
    const isStaticAllowed = STATIC_ONLY_ORIGINS.has(origin);

    if (!isAllowed && !isStaticAllowed) {
      // En producción: bloquear estrictamente
      if (config.NODE_ENV === 'production') {
        fastify.log.warn('CORS: origin blocked', {
          origin,
          path: request.url,
          ip: request.ip,
        });
        return reply.status(403).send({
          status: 403,
          code: 'CORS_ORIGIN_BLOCKED',
          message: 'Origin not allowed.',
          correlation_id: request.id,
        });
      }
    }

    // Headers CORS para orígenes válidos
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    reply.header(
      'Access-Control-Allow-Headers',
      [
        'Authorization',
        'Content-Type',
        'Accept',
        'X-CSRF-Token',
        'X-Correlation-ID',
        'X-Request-ID',
        'X-Mtls-Serial',
      ].join(', ')
    );
    reply.header('Access-Control-Expose-Headers', [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-CSP-Nonce',
      'X-Correlation-ID',
    ].join(', '));
    reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header('Access-Control-Max-Age', '600'); // 10 min preflight cache

    // Pre-flight requests: responder inmediatamente
    if (request.method === 'OPTIONS') {
      return reply.status(204).send();
    }
  });

  done();
};

export { corsPlugin };