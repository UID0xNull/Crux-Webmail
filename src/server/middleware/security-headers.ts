// ============================================================================
// Crux-Webmail — Security Headers Middleware (Hardened)
// ============================================================================
// CSP estricto con nonces criptográficos para scripts.
// COOP/COEP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy.
// Defense-in-depth: nonce rotation por request, reporting-uri para CSP violations.
// ============================================================================

import { FastifyPluginCallback } from 'fastify';
import crypto from 'node:crypto';
import { auditLogger } from '../utils/audit-logger';

// ------------------------------------------------------------------
// CSP Nonce — criptográficamente seguro por request
// ------------------------------------------------------------------
function generateCspNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

// ------------------------------------------------------------------
// Security Headers Plugin
// ------------------------------------------------------------------
const securityHeadersPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  // Pre-handler: generar nonce por request y adjuntarlo al contexto
  fastify.addHook('preHandler', async (request, reply) => {
    const nonce = generateCspNonce();
    reply.header('X-CSP-Nonce', nonce);
    (request as any).cspNonce = nonce;
  });

  // onSend: inyectar headers de seguridad finales en TODAS las respuestas
  fastify.addHook('onSend', async (request, reply) => {
    const nonce = (request as any).cspNonce || generateCspNonce();

    // Content-Security-Policy — estricto, nonce-based, sin unsafe-inline
    reply.header(
      'Content-Security-Policy',
      [
        `default-src 'self'`,
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        `style-src 'self' 'nonce-${nonce}'`,
        `img-src 'self' data: blob:`,
        `font-src 'self'`,
        `connect-src 'self' https://api.crux.local https://api.crux.internal`,
        `frame-ancestors 'none'`,
        `form-action 'self'`,
        `base-uri 'self'`,
        `object-src 'none'`,
        `media-src 'self'`,
        `worker-src 'self' blob:`,
        `manifest-src 'self'`,
        `frame-src 'none'`,
        `child-src 'self'`,
        `report-uri /api/security/csp-report`,
        `upgrade-insecure-requests`,
      ].join('; ')
    );

    // Strict-Transport-Security (HSTS preload, 1 año)
    reply.header(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );

    // Cross-Origin isolation — required for SharedArrayBuffer + sandboxing
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');

    // Prevent clickjacking (dual protection with CSP frame-ancestors)
    reply.header('X-Frame-Options', 'DENY');

    // Prevent MIME sniffing (defense-in-depth)
    reply.header('X-Content-Type-Options', 'nosniff');

    // Referrer policy — minimum disclosure
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions-Policy — deny-all-default, explicit allows for self
    reply.header(
      'Permissions-Policy',
      [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()',
        'magnetometer=()',
        'gyroscope=()',
        'accelerometer=()',
        'autoplay=()',
        'fullscreen=(self)',
        'clipboard-read=(self)',
        'clipboard-write=(self)',
        'keyboard-map=()',
        'screen-wake-lock=()',
        'sync-xhr=()',
        'xr-spatial-tracking=()',
      ].join(', ')
    );

    // X-Permitted-Cross-Domain-Policies — restrict PDF reader behavior
    reply.header('X-Permitted-Cross-Domain-Policies', 'none');

    // Cache control para API responses — prevent stale data
    if (request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      reply.header('Pragma', 'no-cache');
      reply.header('Surrogate-Control', 'no-store');
    }

    // Server header — minimal disclosure
    reply.header('Server', 'Crux-Webmail/2.0');

    return reply.send();
  });

  // ----------------------------------------------------------------
  // CSP Violation Reporter — endpoint para monitorizar bypasses
  // ----------------------------------------------------------------
  fastify.post('/security/csp-report', async (request: any, reply: any) => {
    try {
      const body = request.body;
      auditLogger.warn('CSP violation detected', {
        client_ip: request.ip,
        session_id: request.id,
        metadata: {
          violatedDirective: body?.['csp-report']?.violatedDirective,
          blockedUri: body?.['csp-report']?.blockedUri,
          effectiveDirective: body?.['csp-report']?.effectiveDirective,
          sourceFile: body?.['csp-report']?.sourceFile,
          lineNumber: body?.['csp-report']?.lineNumber,
        },
      });
    } catch {
      // Silenciar errores de parsing — los reports pueden ser malformados
    }
    reply.status(204).send();
  });

  done();
};

export { securityHeadersPlugin, generateCspNonce };