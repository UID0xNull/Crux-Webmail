// ============================================================================
// Crux-Webmail — Auth Routes (/api/auth)
// ============================================================================

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSessionManager } from '../modules/auth/session-manager';
import { generateSecureUuid } from '../utils/crypto';
import { auditLogger } from '../utils/audit-logger';
import { createValidationError, CruxError } from '../errors/handler';

// ------------------------------------------------------------------
// Schemas
// ------------------------------------------------------------------
const LoginSchema = z.object({
  username: z.string().email('Invalid email format'),
  password: z.string().min(8).max(256),
  device_fingerprint: z.object({
    browser: z.string(),
    os: z.string(),
    screen: z.string(),
    timezone: z.string(),
    languages: z.array(z.string()),
  }),
});

const RefreshSchema = z.object({
  refresh_token: z.string().min(16),
  session_id: z.string().uuid(),
});

// ------------------------------------------------------------------
// Register all auth routes
// ------------------------------------------------------------------
export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/auth/login
  fastify.post('/login', async (request: any, reply: any) => {
    const body = request.body as Record<string, unknown>;
    const parsed = LoginSchema.safeParse(body);

    if (!parsed.success) {
      throw createValidationError('Invalid login payload', {
        errors: parsed.error.issues.map((e: any) => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    const { username, password, device_fingerprint } = parsed.data;
    const clientIp = request.ip || request.socket.remoteAddress || 'unknown';
    const mtlsSerial = request.headers['x-mtls-serial'] as string || 'none';

    const sessionManager = await getSessionManager();
    const result = await sessionManager.authenticate(
      username,
      password,
      device_fingerprint,
      clientIp,
      mtlsSerial
    );

    if (!result.success) {
      auditLogger.warn('Login failed', {
        actor_id: username,
        client_ip: clientIp,
        metadata: { error: result.error },
      });
      reply.status(401);
      return {
        status: 401,
        code: result.error || 'AUTH_FAILED',
        message: 'Invalid credentials.',
        correlation_id: request.id,
      };
    }

    auditLogger.info('Login successful', {
      actor_id: username,
      session_id: result.session_id,
      client_ip: clientIp,
    });

    reply.code(200);
    return {
      status: 200,
      access_token: result.token,
      refresh_token: result.refreshToken,
      session_id: result.session_id,
      fingerprint: result.fingerprint,
      correlation_id: request.id,
    };
  });

  // POST /api/auth/refresh
  fastify.post('/refresh', async (request: any, reply: any) => {
    const body = request.body as Record<string, unknown>;
    const parsed = RefreshSchema.safeParse(body);

    if (!parsed.success) {
      throw createValidationError('Invalid refresh payload');
    }

    const { refresh_token, session_id } = parsed.data;
    const sessionManager = await getSessionManager();
    const result = await sessionManager.rotateAccessToken(refresh_token, session_id);

    if (!result.success) {
      reply.status(401);
      return {
        status: 401,
        code: result.error || 'REFRESH_FAILED',
        message: 'Token refresh failed.',
        correlation_id: request.id,
      };
    }

    return {
      status: 200,
      access_token: result.accessToken,
      session_id,
      correlation_id: request.id,
    };
  });

  // POST /api/auth/logout
  fastify.post('/logout', async (request: any, reply: any) => {
    const body = request.body as Record<string, unknown>;
    const sessionId = (body as any)?.session_id;

    const sessionManager = await getSessionManager();
    const userId = (request as any).secureContext?.user_id;

    if (sessionId) {
      await sessionManager.revokeSession(sessionId);
    } else if (userId) {
      await sessionManager.revokeAllUserSessions(userId);
    }

    auditLogger.info('User logged out', {
      actor_id: userId,
      session_id: sessionId,
    });

    return {
      status: 200,
      message: 'Logged out successfully.',
      correlation_id: request.id,
    };
  });
}