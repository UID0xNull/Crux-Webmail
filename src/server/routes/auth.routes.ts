// ============================================================================
// Crux-Webmail — Auth Routes (/api/auth)
// ============================================================================
// Login, Register, Refresh, Logout, Profile, Change Password,
// MFA Setup/Verify/Enable — con rate-limiting y audit logging.
//
// Formato unificado: todas las respuestas siguen ApiResponse<T>:
//   { data?: T; error?: ApiError; correlation_id: string }
// ============================================================================

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getAuthService } from 'modules/auth/auth-service';
import { getSessionManager } from 'modules/auth/session-manager';
import { auditLogger } from 'utils/audit-logger';
import { CruxError } from 'errors/handler';
import { sendSuccess, sendError, sendOperation } from 'utils/api-response';

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

const MFAVerifySchema = z.object({
  mfa_session_id: z.string().uuid(),
  code: z.string().length(6),
});

const MFAEnableSchema = z.object({
  mfa_session_id: z.string().uuid(),
  code: z.string().length(6),
});

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
        summary: 'Get current user profile',
        tags: ['auth'],
      },
    },
    async (request: any, reply) => {
      try {
        const profile = await authService.getProfile(request.user_id);
        return sendSuccess(reply, profile);
      } catch (err) {
        auditLogger.error('Profile fetch failed', {
          actor_id: (request as any).user_id,
          metadata: { error: (err as Error).message },
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
        body: RegisterSchema,
        summary: 'Register a new user',
        tags: ['auth'],
      },
    },
    async (request: any, reply) => {
      const body = RegisterSchema.parse(request.body);
      const result = await authService.register({
        username: body.username,
        password: body.password,
        display_name: body.display_name,
      });

      if (!result.success) {
        return sendError(reply, 400, result.error ?? 'REGISTRATION_FAILED', result.error ?? 'Registration failed');
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
        body: LoginSchema,
        summary: 'Login user',
        tags: ['auth'],
      },
    },
    async (request: any, reply) => {
      const body = LoginSchema.parse(request.body);
      const clientIp = request.ip;

      const result = await authService.login({
        username: body.username,
        password: body.password,
        device_fingerprint: body.device_fingerprint,
        clientIp,
        mtlsSerial: request.mtls_serial || 'none',
      });

      if (result.requiresMFA) {
        return sendSuccess(reply, {
          requires_mfa: true,
          mfa_session_id: result.mfaSessionId,
        });
      }

      if (!result.success) {
        return sendError(reply, 401, result.error ?? 'AUTH_FAILED', result.error ?? 'Authentication failed');
      }

      // Set refresh token as HTTP-only cookie
      reply.setCookie('refresh_token', result.refreshToken!, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60,
      });

      return sendSuccess(reply, {
        access_token: result.token,
        session_id: result.session_id,
        fingerprint: result.fingerprint,
        expires_in: 3600,
      });
    }
  );

  // POST /api/auth/refresh
  fastify.post(
    '/refresh',
    {
      config: { rateLimit: { max: 30, timeWindow: '60000' } },
      schema: {
        body: RefreshSchema,
        summary: 'Refresh access token',
        tags: ['auth'],
      },
    },
    async (request: any, reply) => {
      const body = RefreshSchema.parse(request.body);
      const clientIp = request.ip;

      const sessionManager = await getSessionManager();
      const result = await sessionManager.refreshToken(
        body.refresh_token,
        body.session_id,
        clientIp
      );

      if (!result.success) {
        reply.clearCookie('refresh_token');
        return sendError(reply, 401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');
      }

      return sendSuccess(reply, {
        access_token: result.token,
        refresh_token: result.refreshToken,
        session_id: result.session_id,
        fingerprint: result.fingerprint,
        expires_in: 3600,
      });
    }
  );

  // POST /api/auth/logout
  fastify.post(
    '/logout',
    {
      schema: {
        body: LogoutSchema,
        summary: 'Logout user',
        tags: ['auth'],
      },
    },
    async (request: any, reply) => {
      const body = LogoutSchema.parse(request.body);
      const clientIp = request.ip;

      const sessionManager = await getSessionManager();
      await sessionManager.revokeSession(
        body.session_id,
        clientIp,
        'User initiated logout'
      );

      reply.clearCookie('refresh_token');

      auditLogger.info('User logout', {
        actor_id: (request as any).user_id,
        client_ip: clientIp,
      });

      return sendSuccess(reply, { status: 'logged_out' });
    }
  );

  // POST /api/auth/password/change
  fastify.post(
    '/password/change',
    {
      preHandler: [verifyAuthMiddleware],
      config: { rateLimit: { max: 10, timeWindow: '3600000' } },
      schema: {
        body: ChangePasswordSchema,
        summary: 'Change user password',
        tags: ['auth'],
      },
    },
    async (request: any, reply) => {
      const body = ChangePasswordSchema.parse(request.body);
      const result = await authService.changePassword(
        request.user_id,
        {
          currentPassword: body.current_password,
          newPassword: body.new_password,
        },
        request.ip
      );

      if (!result.success) {
        return sendError(reply, 400, result.error ?? 'PASSWORD_CHANGE_FAILED', result.error ?? 'Password change failed');
      }

      return sendSuccess(reply, { status: 'password_changed' });
    }
  );

  // POST /api/auth/mfa/setup
  fastify.post(
    '/mfa/setup',
    {
      preHandler: [verifyAuthMiddleware],
      schema: {
        summary: 'Initiate MFA setup',
        tags: ['auth', 'mfa'],
      },
    },
    async (request: any, reply) => {
      try {
        const result = await authService.setupMFA(
          request.user_id,
          request.ip
        );
        return sendSuccess(reply, result);
      } catch (err) {
        return sendError(reply, 500, 'MFA_SETUP_ERROR', 'MFA setup failed');
      }
    }
  );

  // POST /api/auth/mfa/verify
  fastify.post(
    '/mfa/verify',
    {
      config: { rateLimit: { max: 10, timeWindow: '300000' } },
      schema: {
        body: MFAVerifySchema,
        summary: 'Verify MFA during login',
        tags: ['auth', 'mfa'],
      },
    },
    async (request: any, reply) => {
      const body = MFAVerifySchema.parse(request.body);
      const result = await authService.verifyMFA(
        body.mfa_session_id,
        body.code,
        request.ip
      );

      if (!result.success) {
        return sendError(reply, 401, result.error ?? 'MFA_VERIFY_FAILED', result.error ?? 'MFA verification failed');
      }

      reply.setCookie('refresh_token', result.refreshToken!, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60,
      });

      return sendSuccess(reply, { access_token: result.token });
    }
  );

  // POST /api/auth/mfa/enable
  fastify.post(
    '/mfa/enable',
    {
      preHandler: [verifyAuthMiddleware],
      schema: {
        body: MFAEnableSchema,
        summary: 'Complete MFA setup',
        tags: ['auth', 'mfa'],
      },
    },
    async (request: any, reply) => {
      const body = MFAEnableSchema.parse(request.body);
      const result = await authService.enableMFA(
        body.mfa_session_id,
        body.code,
        request.ip
      );

      if (!result.success) {
        return sendError(reply, 400, result.error ?? 'MFA_ENABLE_FAILED', result.error ?? 'MFA enable failed');
      }

      return sendSuccess(reply, { status: 'mfa_enabled' });
    }
  );
}

// ------------------------------------------------------------------
// Shared middleware
// ------------------------------------------------------------------
async function verifyAuthMiddleware(request: any, reply: any) {
  const sessionManager = await getSessionManager();
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(reply, 401, 'MISSING_AUTH_TOKEN', 'Missing authentication token');
  }

  const token = authHeader.slice(7);
  const result = await sessionManager.verifySession(token);

  if (!result.valid || !result.user_id) {
    return sendError(reply, 401, 'INVALID_SESSION', 'Invalid session');
  }

  request.user_id = result.user_id;
  request.session_id = result.session_id;
}