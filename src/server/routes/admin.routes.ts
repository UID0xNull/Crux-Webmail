// ============================================================================
// Crux-Webmail — Admin Routes
// ============================================================================
// REST API para el panel de administración: usuarios, sistema, audit logs,
// cola de correo, sesiones activas, configuración.
//
// Formato unificado: todas las respuestas siguen ApiResponse<T>:
//   { data?: T; error?: ApiError; correlation_id: string }
// ============================================================================

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { adminAuthPreHandler } from 'middleware/admin-auth.middleware';
import { auditLogger } from 'utils/audit-logger';
import { sendSuccess, sendError } from 'utils/api-response';
import {
  getUserStats,
  listUsers,
  getUserDetail,
  updateUserRole,
  toggleUserStatus,
  unlockUser,
  createUserUser,
  getSystemHealth,
  getAuditLogs,
  getAuditLogSummary,
  getMailSystemStats,
  getActiveSessions,
  getAppSettings,
  getRecentActivity,
} from 'services/admin-service';

// ------------------------------------------------------------------
// Zod Schemas
// ------------------------------------------------------------------

const UserListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  role: z.enum(['user', 'admin', 'moderator']).optional(),
  isActive: z.coerce.boolean().optional(),
  mfaEnabled: z.coerce.boolean().optional(),
  sort: z.enum(['created_at', 'last_login', 'username']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const AuditLogSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  level: z.enum(['info', 'warn', 'error', 'critical']).optional(),
  category: z.enum(['auth', 'session', 'password', 'mfa', 'account', 'system', 'security']).optional(),
  actor_id: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().optional(),
});

const UpdateRoleSchema = z.object({
  roles: z.array(z.enum(['user', 'admin', 'moderator'])).min(1),
});

const ToggleStatusSchema = z.object({
  isActive: z.boolean(),
});

const CreateUserSchema = z.object({
  username: z.string().email(),
  password: z.string().min(8).max(256),
  display_name: z.string().min(1).max(128).optional(),
  roles: z.array(z.enum(['user', 'admin', 'moderator'])).default(['user']),
});

// ------------------------------------------------------------------
// Register Routes
// ------------------------------------------------------------------

export async function registerAdminRoutes(fastify: FastifyInstance): Promise<void> {
  // All admin routes require admin auth via preHandler
  fastify.addHook('onRequest', adminAuthPreHandler);

  // ---- Dashboard ----
  fastify.get(
    '/dashboard',
    {
      schema: {
        description: 'Get admin dashboard overview',
        tags: ['admin'],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(_request: FastifyRequest, reply: FastifyReply) {
      try {
        const [health, userStats, auditSummary, recent] = await Promise.all([
          getSystemHealth(),
          getUserStats(),
          getAuditLogSummary(),
          getRecentActivity(10),
        ]);
        sendSuccess(reply, {
          system: health,
          users: userStats,
          audits: auditSummary,
          recentActivity: recent.events,
        });
      } catch (err) {
        auditLogger.error('Admin dashboard error', { error: (err as Error).message });
        sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
      }
    },
  );

  // ---- System Health ----
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Get detailed system health',
        tags: ['admin'],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(_request, reply) {
      try {
        const health = await getSystemHealth();
        sendSuccess(reply, health);
      } catch (err) {
        auditLogger.error('System health check error', { error: (err as Error).message });
        sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
      }
    },
  );

  // ---- Mail System Status ----
  fastify.get(
    '/mail-system',
    {
      schema: {
        description: 'Get mail subsystem status (Postfix, Dovecot, Amavis, ClamAV, MinIO)',
        tags: ['admin'],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(_request, reply) {
      try {
        const stats = await getMailSystemStats();
        sendSuccess(reply, stats);
      } catch (err) {
        auditLogger.error('Mail system stats error', { error: (err as Error).message });
        sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
      }
    },
  );

  // ---- App Settings ----
  fastify.get(
    '/settings',
    {
      schema: {
        description: 'Get current application settings',
        tags: ['admin'],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(_request, reply) {
      const settings = getAppSettings();
      sendSuccess(reply, settings);
    },
  );

  // ---- Users ----
  fastify.get(
    '/users',
    {
      schema: {
        description: 'List all users with pagination and filters',
        tags: ['admin'],
        querystring: z.object({}).passthrough(),
        response: { 200: z.record(z.any()) },
      },
    },
    async function handler(request: FastifyRequest, reply: FastifyReply) {
      try {
        const params = UserListSchema.parse((request.query as Record<string, string>));
        const result = await listUsers(params);
        sendSuccess(reply, result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          sendError(reply, 400, 'INVALID_QUERY_PARAMS', 'Invalid query parameters', {
            details: { errors: err.errors },
          });
        } else {
          auditLogger.error('List users error', { error: (err as Error).message });
          sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
      }
    },
  );

  fastify.get(
    '/users/stats',
    {
      schema: {
        description: 'Get user statistics',
        tags: ['admin'],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(_request, reply) {
      try {
        const stats = await getUserStats();
        sendSuccess(reply, stats);
      } catch (err) {
        auditLogger.error('User stats error', { error: (err as Error).message });
        sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
      }
    },
  );

  fastify.get(
    '/users/:userId',
    {
      schema: {
        description: 'Get user details',
        tags: ['admin'],
        params: z.object({ userId: z.string().uuid() }),
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) {
      try {
        const user = await getUserDetail(request.params.userId);
        if (!user) {
          sendError(reply, 404, 'USER_NOT_FOUND', 'User not found');
          return;
        }
        sendSuccess(reply, user);
      } catch (err) {
        auditLogger.error('Get user detail error', { error: (err as Error).message });
        sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
      }
    },
  );

  // ---- User Management Actions ----
  fastify.post(
    '/users',
    {
      schema: {
        description: 'Create a new user',
        tags: ['admin'],
        body: CreateUserSchema.omit({ roles: true }).extend({
          roles: z.array(z.string()).optional(),
        }),
        response: { 201: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(request, reply) {
      try {
        const body = CreateUserSchema.parse(
          (request as FastifyRequest<{ Body: { username: string; password: string; display_name?: string; roles?: string[] } }>),
        );
        const user = await createUserUser(body.username, body.password, body.display_name, body.roles);
        auditLogger.info('New user created via admin panel', {
          actor_id: (request as any).admin?.user_id,
          metadata: { username: body.username },
        });
        sendSuccess(reply, user, 201);
      } catch (err) {
        if (err instanceof z.ZodError) {
          sendError(reply, 400, 'INVALID_INPUT', 'Invalid input', {
            details: { errors: err.errors },
          });
        } else {
          auditLogger.error('Create user error', { error: (err as Error).message });
          sendError(reply, 400, 'CREATE_USER_FAILED', (err as Error).message);
        }
      }
    },
  );

  fastify.patch(
    '/users/:userId/roles',
    {
      schema: {
        description: 'Update user roles',
        tags: ['admin'],
        body: UpdateRoleSchema,
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(request, reply) {
      try {
        const body = UpdateRoleSchema.parse(
          (request as FastifyRequest<{ Params: { userId: string }; Body: { roles: string[] } }>),
        );
        const adminId = (request as any).admin?.user_id;
        auditLogger.info('User roles updated', {
          actor_id: adminId,
          metadata: { target_user: request.params.userId, roles: body.roles },
        });
        const user = await updateUserRole(request.params.userId, body.roles);
        if (!user) {
          sendError(reply, 404, 'USER_NOT_FOUND', 'User not found');
          return;
        }
        sendSuccess(reply, user);
      } catch (err) {
        if (err instanceof z.ZodError) {
          sendError(reply, 400, 'INVALID_INPUT', 'Invalid input', {
            details: { errors: err.errors },
          });
        } else {
          auditLogger.error('Update roles error', { error: (err as Error).message });
          sendError(reply, 400, 'UPDATE_ROLES_FAILED', (err as Error).message);
        }
      }
    },
  );

  fastify.patch(
    '/users/:userId/status',
    {
      schema: {
        description: 'Activate/deactivate a user',
        tags: ['admin'],
        body: ToggleStatusSchema,
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(request, reply) {
      try {
        const body = ToggleStatusSchema.parse(
          (request as FastifyRequest<{ Params: { userId: string }; Body: { isActive: boolean } }>),
        );
        const adminId = (request as any).admin?.user_id;
        auditLogger.info('User status toggled', {
          actor_id: adminId,
          metadata: { target_user: request.params.userId, isActive: body.isActive },
        });
        const user = await toggleUserStatus(request.params.userId, body.isActive);
        if (!user) {
          sendError(reply, 404, 'USER_NOT_FOUND', 'User not found');
          return;
        }
        sendSuccess(reply, user);
      } catch (err) {
        if (err instanceof z.ZodError) {
          sendError(reply, 400, 'INVALID_INPUT', 'Invalid input', {
            details: { errors: err.errors },
          });
        } else {
          auditLogger.error('Toggle status error', { error: (err as Error).message });
          sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
      }
    },
  );

  fastify.post(
    '/users/:userId/unlock',
    {
      schema: {
        description: 'Unlock a locked user account',
        tags: ['admin'],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(request, reply) {
      try {
        const adminId = (request as any).admin?.user_id;
        auditLogger.info('User unlocked', {
          actor_id: adminId,
          metadata: { target_user: request.params.userId },
        });
        const success = await unlockUser(request.params.userId);
        if (!success) {
          sendError(reply, 404, 'USER_NOT_FOUND', 'User not found');
          return;
        }
        sendSuccess(reply, { unlocked: true });
      } catch (err) {
        auditLogger.error('Unlock user error', { error: (err as Error).message });
        sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
      }
    },
  );

  // ---- Audit Logs ----
  fastify.get(
    '/audit/logs',
    {
      schema: {
        description: 'List audit log entries with filters',
        tags: ['admin'],
        querystring: z.object({}).passthrough(),
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(request, reply) {
      try {
        const params = AuditLogSchema.parse(
          (request as FastifyRequest<{ Querystring: Record<string, string> }>),
        );
        const result = await getAuditLogs(params);
        sendSuccess(reply, result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          sendError(reply, 400, 'INVALID_QUERY_PARAMS', 'Invalid query parameters', {
            details: { errors: err.errors },
          });
        } else {
          auditLogger.error('Audit logs error', { error: (err as Error).message });
          sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
        }
      }
    },
  );

  fastify.get(
    '/audit/summary',
    {
      schema: {
        description: 'Get audit log summary statistics',
        tags: ['admin'],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(_request, reply) {
      try {
        const summary = await getAuditLogSummary();
        sendSuccess(reply, summary);
      } catch (err) {
        auditLogger.error('Audit summary error', { error: (err as Error).message });
        sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
      }
    },
  );

  // ---- Active Sessions ----
  fastify.get(
    '/sessions',
    {
      schema: {
        description: 'List all active sessions',
        tags: ['admin'],
        response: { 200: { type: 'object', additionalProperties: true } },
      },
    },
    async function handler(_request, reply) {
      try {
        const sessions = await getActiveSessions();
        sendSuccess(reply, { sessions, total: sessions.length });
      } catch (err) {
        auditLogger.error('Sessions list error', { error: (err as Error).message });
        sendError(reply, 500, 'INTERNAL_ERROR', 'Internal server error');
      }
    },
  );

  // ---- Admin Actions Audit ----
  fastify.addHook('onResponse', async function handler(request, _reply) {
    if (request.method !== 'GET') {
      auditLogger.info('Admin panel action', {
        actor_id: (request as any).admin?.user_id,
        session_id: (request as any).admin?.session_id,
        source: 'admin-panel',
        metadata: {
          method: request.method,
          url: request.url,
          status: _reply.statusCode,
        },
      });
    }
  });
}