// ============================================================================
// Crux-Webmail — CSRF Protection Middleware
// ============================================================================
// Double-Submit Cookie Pattern: genera token CSRF por sesión, valida en
// todas las rutas mutables (POST/PUT/PATCH/DELETE). Compatible con SPAs.
// ============================================================================

import { FastifyPluginCallback } from 'fastify';
import { generateNonce } from '../utils/crypto';
import { auditLogger } from '../utils/audit-logger';

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = '__csrf.token';
const CSRF_HEADER_NAME = 'x-csrf-token';

// Rutas que NO requieren CSRF (solo GET/HEAD/OPTIONS o endpoints específicos)
const CSRF_EXEMPT_PATHS = ['/health', '/ready', '/api/security/csp-report'];

const csrfPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  // preHandler: generar o validar token CSRF
  fastify.addHook('preHandler', async (request, reply) => {
    const path = request.url;
    const method = request.method;

    // Bypass para rutas exempt y métodos seguros
    if (CSRF_EXEMPT_PATHS.includes(path)) {
      return;
    }
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return;
    }

    // 1. Obtener o generar token CSRF desde session context
    const sessionManager = await import('../modules/auth/session-manager');
    const sessionId = (request as any).secureContext?.session_id;

    if (!sessionId) {
      // Sin sesión: permitir fallback a cookie pattern
      const existingToken = (request as any).cookies?.[CSRF_COOKIE_NAME];
      if (existingToken) {
        (request as any).csrfToken = existingToken;
        return;
      }
      return;
    }

    const redisConn = await import('utils/connections').then(m => m.getRedis());
    const csrfKey = `csrf:${sessionId}`;

    let token = await redisConn.get(csrfKey);
    if (!token) {
      token = generateNonce(CSRF_TOKEN_LENGTH);
      await redisConn.set(csrfKey, token, 'EX', 3600); // 1 hour TTL
      (reply as any).setCookie(CSRF_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict' as const,
        path: '/',
        maxAge: 3600,
      });
    }

    (request as any).csrfToken = token;

    // 2. Validar token en request header
    const providedToken = request.headers[CSRF_HEADER_NAME];

    if (!providedToken || providedToken !== token) {
      auditLogger.critical('CSRF validation failed', {
        actor_id: (request as any).secureContext?.user_id,
        session_id: sessionId,
        client_ip: request.ip,
        metadata: {
          method,
          path,
          has_token: !!providedToken,
        },
      });

      return reply.status(403).send({
        status: 403,
        code: 'CSRF_TOKEN_INVALID',
        message: 'Cross-Site Request Forgery validation failed.',
        correlation_id: request.id,
      });
    }

    // Token válido — continuar
  });

  done();
};

export { csrfPlugin };