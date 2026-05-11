// ============================================================================
// Crux-Webmail — Auth Routes (/api/auth)
// ============================================================================
// Login, Register, Refresh, Logout, Profile, Change Password,
// MFA Setup/Verify/Enable — con rate-limiting y audit logging.
//
// Formato unificado: todas las respuestas siguen ApiResponse<T>:
//   { data?: T; error?: ApiError; correlation_id: string }
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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
async function verifyAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const sessionManager = await getSessionManager();
  const authHeader = request.headers.authorization as string | undefined;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(reply, 401, 'MISSING_AUTH_TOKEN', 'Missing authentication token');
    return reply.send(null);
  }

  const token = authHeader.slice(7);
  const result = await sessionManager.verifySession(token);

  if (!result.valid || !result.user_id) {
    sendError(reply, 401, 'INVALID_SESSION', 'Invalid session');
    return reply.send(null);
  }

  (request as any).user_id = result.user_id;
  (request as any).session_id = result.session_id;
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
        description: 'Get current user profile',
        tags: ['auth'],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(request, reply) {
      try {
        const userId = (request as any).user_id;
        const profile = await authService.getProfile(userId);
        return sendSuccess(reply, profile);
      } catch (_err) {
        auditLogger.error('Profile fetch failed', {
          actor_id: (request as any).user_id,
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
        description: 'Register a new user',
        tags: ['auth'],
        body: RegisterSchema,
        response: { 201: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(request, reply) {
      const body = (request as FastifyRequest<{ Body: z.infer<typeof RegisterSchema> }>);

      const result = await authService.register({
        username: body.body.username,
        password: body.body.password,
        display_name: body.body.display_name,
      });

      if (!result.success) {
        return sendError(reply, 400, (result.error ?? 'REGISTRATION_FAILED') as string, result.message ?? 'Registration failed');
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
        description: 'Login user',
        tags: ['auth'],
        body: LoginSchema,
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(request, reply) {
      const typedRequest = request as FastifyRequest<{ Body: z.infer<typeof LoginSchema> }>;
      const body = LoginSchema.parse(typedRequest.body);

      const clientIp = typedRequest.ip;

      const result = await authService.login({
        username: body.username,
        password: body.password