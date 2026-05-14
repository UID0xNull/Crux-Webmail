// ============================================================================
// Crux-Webmail — Auth Routes (/api/auth)
// ============================================================================
// Login, Register, Refresh, Logout, Profile, Change Password,
// MFA Setup/Verify/Enable — con rate-limiting y audit logging.
//
// Formato unificado: todas las respuestas siguen ApiResponse<T>:
//   { data?: T; error?: ApiError; correlation_id: string }
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply, FastifySchema } from 'fastify';
import { z } from 'zod';
import { getAuthService } from 'modules/auth/auth-service';
import { getSessionManager } from 'modules/auth/session-manager';
import { auditLogger } from 'utils/audit-logger';
import { sendSuccess, sendError } from 'utils/api-response';

// ------------------------------------------------------------------
// Schemas (Zod validation)
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

const RegisterSchema = z.object({
  username: z.string().email('Invalid email format'),
  password: z.string().min(8).max(128),
  display_name: z.string().min(1).max(128).optional(),
});

const RefreshSchema = z.object({
  refresh_token: z.string().min(16),
  session_id: z.string().uuid(),
});

const LogoutSchema = z.object({
  session_id: z.string().uuid().optional(),
});

const ChangePasswordSchema = z.object({
  current_password: z.string().min(8).max(256),
  new_password: z.string().min(8).max(128),
});

const MFASetupSchema = z.object({
  clientIp: z.string().optional(),
});

const MFAVerifySchema = z.object({
  mfa_session_id: z.string().uuid(),
  code: z.string().length(6),
});

const MFAEnableSchema = z.object({
  mfa_session_id: z.string().uuid(),
  code: z.string().length(6),
});

// ------------------------------------------------------------------
// Shared middleware (declared before use)
// ------------------------------------------------------------------
async function verifyAuthMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sessionManager = await getSessionManager();
  const authHeader = request.headers.authorization as string | undefined;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    void sendError(reply, 401, 'MISSING_AUTH_TOKEN', 'Missing authentication token');
    return;
  }

  const token = authHeader.slice(7);
  const result = await sessionManager.verifySession(token);

  if (!result.valid || !result.user_id) {
    void sendError(reply, 401, 'INVALID_SESSION', 'Invalid session');
    return;
  }

  (request as any).userId = result.user_id;
  (request as any).session_id = result.session_id;
  return;
}

// ------------------------------------------------------------------
// Register routes
// ------------------------------------------------------------------
export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const authService = getAuthService();

  // GET /api/auth/profile
  fastify.get(
    '/profile',
    {
      preHandler: [verifyAuthMiddleware],
      schema: {
        description: 'Get authenticated user profile',
        tags: ['auth'],
        response: {
          200: {
            content: {
              'application/json': {
                type: 'object',
                properties: {
                  data: { type: 'object', additionalProperties: true },
                  correlation_id: { type: 'string' },
                },
              },
            },
          },
        },
      } as FastifySchema,
    },
    async function handler(request: FastifyRequest, reply: FastifyReply) {
      try {
        const userId = (request as any).userId;
        const profile = await authService.getProfile(userId);
        return sendSuccess(reply, profile);
      } catch (_err) {
        auditLogger.error('Profile fetch failed', {
          actor_id: (request as any).userId,
          metadata: { error: (_err as Error)?.message ?? String(_err) },
        });
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    }
  );

  // POST /api/auth/register
  fastify.post(
    '/register',
    {
      config: { rateLimit: { max: 10, timeWindow: '3600000' } },
      schema: {
        description: 'Register a new user account',
        tags: ['auth'],
        response: { 201: { type: 'object', additionalProperties: true } },
      } as FastifySchema,
    },
    async function handler(request: FastifyRequest, reply: FastifyReply) {
      const body = RegisterSchema.parse(request.body);
      const result = await authService.register({
        username: body.username,
        password: body.password,
        display_name: body.display_name,
      });

      if (!result.success) {
        return sendError(reply, 400, result.error ?? 'REGISTRATION_FAILED', 'Registration failed');
      }

      return sendSuccess(reply, result, 201);
    }
  );

  // POST /api/auth/login
  fastify.post(
    '/login',
    {
      config: { rateLimit: { max: 20, timeWindow: '60000' } },
      schema: {
        description: 'Authenticate user and create session',
        tags: ['auth'],
        response: { 200: { type: 'object', additionalProperties: true } },
      } as FastifySchema,
    },
    async function handler(request: FastifyRequest, reply: FastifyReply) {
      const body = LoginSchema.parse(request.body);
      const clientIp = (request as any).ip;

      const result = await authService.login({
        username: body.username,
        password: body.password,
        device_fingerprint: body.device_fingerprint as { browser: string; os: string; screen: string; timezone: string; languages: string[] },
        clientIp: clientIp,
        mtlsSerial: 'none',
      });

      if (!result.success) {
        auditLogger.warn('Login failed', { actor_id: body.username, metadata: { ip: clientIp } });
        return sendError(reply, 401, String(result.error ?? 'AUTH_FAILED'), 'Authentication failed');
      }

      return sendSuccess(reply, result);
    }
  );

  // POST /api/auth/refresh
  fastify.post(
    '/refresh',
    {
      schema: {
        description: 'Refresh authentication tokens',
        tags: ['auth'],
        response: { 200: { type: 'object', additionalProperties: true } },
      } as FastifySchema,
    },
    async function handler(request: FastifyRequest, reply: FastifyReply) {
      const body = RefreshSchema.parse(request.body);

      try {
        const result = await authService.refreshTokens(
          body.session_id,
          body.refresh_token
        );

        if (!result.success) {
          return sendError(reply, 401, String(result.error ?? 'REFRESH_FAILED'), 'Token refresh failed');
        }

        return sendSuccess(reply, result);
      } catch (_err) {
        auditLogger.error('Refresh tokens error', { metadata: { error: String(_err) } });
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    }
  );

  // POST /api/auth/logout
  fastify.post(
    '/logout',
    {
      preHandler: [verifyAuthMiddleware],
      schema: {
        description: 'Logout user and invalidate session',
        tags: ['auth'],
        response: { 200: { type: 'object', additionalProperties: true } },
      } as FastifySchema,
    },
    async function handler(request: FastifyRequest, reply: FastifyReply) {
      const userId = (request as any).userId;

      try {
        await authService.logout({ userId });
        return sendSuccess(reply, { logged_out: true });
      } catch (_err) {
        auditLogger.error('Logout error', { actor_id: userId, metadata: { error: String(_err) } });
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    }
  );

  // POST /api/auth/change-password
  fastify.post(
    '/change-password',
    {
      preHandler: [verifyAuthMiddleware],
      schema: {
        description: 'Change authenticated user password',
        tags: ['auth'],
        response: { 200: { type: 'object', additionalProperties: true } },
      } as FastifySchema,
    },
    async function handler(request: FastifyRequest, reply: FastifyReply) {
      const userId = (request as any).userId;
      const body = ChangePasswordSchema.parse(request.body);

      try {
        const result = await authService.changePassword({
          userId,
          current_password: body.current_password,
          new_password: body.new_password,
        });

        if (!result.success) {
          return sendError(reply, 400, String(result.error ?? 'PASSWORD_CHANGE_FAILED'), 'Failed to change password');
        }

        auditLogger.info('Password changed', { actor_id: userId });
        return sendSuccess(reply, { message: 'Password changed' });
      } catch (_err) {
        auditLogger.error('Change password error', { actor_id: userId, metadata: { error: String(_err) } });
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    }
  );

  // POST /api/auth/mfa/setup
  fastify.post(
    '/mfa/setup',
    {
      preHandler: [verifyAuthMiddleware],
      schema: {
        description: 'Setup MFA for authenticated user',
        tags: ['auth'],
        response: { 200: { type: 'object', additionalProperties: true } },
      } as FastifySchema,
    },
    async function handler(request: FastifyRequest, reply: FastifyReply) {
      const userId = (request as any).userId;
      const clientIp = (request as any).ip;

      try {
        const result = await authService.setupMFA(userId, clientIp);
        return sendSuccess(reply, result);
      } catch (_err) {
        auditLogger.error('MFA setup error', { actor_id: userId, metadata: { error: String(_err) } });
        return sendError(reply, 500, 'MFA_SETUP_ERROR', 'Failed to setup MFA');
      }
    }
  );

  // POST /api/auth/mfa/verify
  fastify.post(
    '/mfa/verify',
    {
      schema: {
        description: 'Verify MFA code',
        tags: ['auth'],
        response: { 200: { type: 'object', additionalProperties: true } },
      } as FastifySchema,
    },
    async function handler(request: FastifyRequest, reply: FastifyReply) {
      const body = MFAVerifySchema.parse(request.body);

      try {
        const result = await authService.verifyMfa({
          mfa_session_id: body.mfa_session_id,
          code: body.code,
        });

        if (!result.success) {
          return sendError(reply, 400, String(result.error ?? 'MFA_VERIFY_FAILED'), 'MFA verification failed');
        }

        auditLogger.info('MFA verified', { actor_id: String(result.user_id ?? '') });
        return sendSuccess(reply, result);
      } catch (_err) {
        auditLogger.error('MFA verify error', { metadata: { error: String(_err) } });
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    }
  );

  // POST /api/auth/mfa/enable
  fastify.post(
    '/mfa/enable',
    {
      preHandler: [verifyAuthMiddleware],
      schema: {
        description: 'Enable MFA for authenticated user',
        tags: ['auth'],
        response: { 200: { type: 'object', additionalProperties: true } },
      } as FastifySchema,
    },
    async function handler(request: FastifyRequest, reply: FastifyReply) {
      const userId = (request as any).userId;
      const body = MFAEnableSchema.parse(request.body);

      try {
        const result = await authService.enableMfa({
          userId,
          mfa_session_id: body.mfa_session_id,
          code: body.code,
        });

        if (!result.success) {
          return sendError(reply, 400, String(result.error ?? 'MFA_ENABLE_FAILED'), 'Failed to enable MFA');
        }

        auditLogger.info('MFA enabled', { actor_id: userId });
        return sendSuccess(reply, result);
      } catch (_err) {
        auditLogger.error('Enable MFA error', { actor_id: userId, metadata: { error: String(_err) } });
        return sendError(reply, 500, 'INTERNAL_ERROR', 'Internal Server Error');
      }
    }
  );
}