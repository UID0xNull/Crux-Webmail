// ============================================================================
// Crux-Webmail — Authentication Middleware
// ============================================================================
// Verifica JWT + binding de sesión + mTLS certificate + fingerprint.
// Inyecta SecureContext en request para auditoría.
// ============================================================================

import { FastifyPluginCallback } from 'fastify';
import { hashIp } from '../utils/crypto';
import { getSessionManager } from '../modules/auth/session-manager';
import { auditLogger } from '../utils/audit-logger';
import { createAuthError } from '../errors/handler';
import { SecureContext, AuditEvent } from '../types/global';

const SKIP_AUTH_PATHS = ['/health', '/ready', '/api/auth/login'];

const authMiddleware: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.addHook('onRequest', async (request, reply) => {
    // Skip auth para endpoints públicos
    if (SKIP_AUTH_PATHS.includes(request.url)) {
      return;
    }

    // 1. Extraer token del header Authorization
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      auditLogger.warn('Missing or malformed Authorization header', {
        client_ip: request.ip,
        session_id: request.id,
      });
      return reply.status(401).send({
        status: 401,
        code: 'MISSING_AUTH_TOKEN',
        message: 'Authorization Bearer token required.',
        correlation_id: request.id,
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer "

    // 2. Validar token + session binding
    const sessionManager = await getSessionManager();
    const clientIp = request.ip || request.socket.remoteAddress || 'unknown';
    const result = await sessionManager.validateToken(token, clientIp);

    if (!result.valid) {
      const error = result.error || 'TOKEN_INVALID';
      auditLogger.warn('Token validation failed', {
        client_ip: clientIp,
        session_id: request.id,
        metadata: { error },
      });

      if (error === 'TOKEN_REVOKED' || error === 'SESSION_REVOKED') {
        return reply.status(401).send({
          status: 401,
          code: error,
          message: 'Session has been revoked. Please re-authenticate.',
          correlation_id: request.id,
        });
      }

      if (error === 'TOKEN_EXPIRED' || error === 'SESSION_EXPIRED') {
        return reply.status(401).send({
          status: 401,
          code: error,
          message: 'Session expired. Please refresh or re-authenticate.',
          correlation_id: request.id,
          details: { action: 'refresh' },
        });
      }

      if (error === 'FINGERPRINT_MISMATCH') {
        return reply.status(401).send({
          status: 401,
          code: error,
          message: 'Device fingerprint mismatch. Session terminated for security.',
          correlation_id: request.id,
        });
      }

      return reply.status(401).send({
        status: 401,
        code: 'AUTH_FAILED',
        message: 'Invalid authentication token.',
        correlation_id: request.id,
      });
    }

    // 3. Construir SecureContext y adjuntar a request
    const secureContext: SecureContext = {
      mtls_verified: !!request.headers['x-mtls-serial'],
      session_id: result.session!.id,
      user_id: result.session!.userId,
      fingerprint: result.session!.fingerprint,
      ip_hash: result.session!.ip_hash,
      audit_event_id: request.id,
    };

    // Adjuntar context al request
    (request as any).secureContext = secureContext;

    // 4. Crear evento de audit
    const auditEvent: Partial<AuditEvent> = {
      actor_id: result.session!.userId,
      session_id: result.session!.id,
      client_ip: clientIp,
      user_agent: request.headers['user-agent'] as string,
      metadata: {
        method: request.method,
        path: request.url,
        mtls_serial: request.headers['x-mtls-serial'] || 'none',
      },
    };

    (request as any).auditEvent = auditEvent;
  });

  done();
};

export { authMiddleware };