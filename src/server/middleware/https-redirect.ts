// ============================================================================
// Crux-Webmail — HTTPS Enforcement Middleware
// ============================================================================
// Redirige HTTP → HTTPS en producción. En dev permite HTTP sin redirección.
// Respeta X-Forwarded-Proto para proxies/TLS termination (nginx, ALB).
// ============================================================================

import { FastifyPluginCallback } from 'fastify';
import { config } from 'config/app.config';
import { auditLogger } from 'utils/audit-logger';

const HTTPS_REDIRECT_EXEMPT = ['/health', '/ready', '/monitoring/'];

const httpsRedirectPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  if (config.NODE_ENV !== 'production') {
    return done();
  }

  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url;

    // Exempt healthchecks and monitoring
    if (HTTPS_REDIRECT_EXEMPT.some(p => path === p || path.startsWith(p))) {
      return;
    }

    // Check forwarded protocol (for reverse proxy / TLS termination)
    const forwardedProto = request.headers['x-forwarded-proto'];
    const isSecure = (request.socket as any).encrypted ||
                     forwardedProto === 'https' ||
                     request.headers['x-forwarded-ssl'] === 'on';

    if (!isSecure) {
      const host = request.headers.host || `${config.SERVER_HOST}:${config.SERVER_PORT}`;
      const redirectUrl = `https://${host}${path}`;

      fastify.log.warn({ url: path, ip: request.ip, forwardedProto }, 'HTTP request in production — redirecting to HTTPS');

      return (reply as any).redirect(301, redirectUrl);
    }
  });

  done();
};

export { httpsRedirectPlugin };