// ============================================================================
// Crux-Webmail — Admin Auth Middleware
// ============================================================================
// Valida que el usuario tenga rol "admin". Reutiliza el session-manager.
// ============================================================================

import type { FastifyReply, FastifyRequest } from 'fastify';
import { getSessionManager } from 'modules/auth/session-manager';
import { UserModel } from 'models/User';

export async function adminAuthPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      reply.code(401);
      reply.send({ error: 'Missing Authorization header' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');
    const sessionManager = getSessionManager();
    const result = await sessionManager.verifySession(token);

    if (!result.valid || !result.user_id) {
      reply.code(401);
      reply.send({ error: 'Invalid or expired session' });
      return;
    }

    // Verificar rol de admin
    const user = await UserModel.findByPk(result.user_id, {
      attributes: ['id', 'username', 'roles', 'is_active'],
    });

    if (!user) {
      reply.code(401);
      reply.send({ error: 'User not found' });
      return;
    }

    if (!user.is_active) {
      reply.code(403);
      reply.send({ error: 'Account is deactivated' });
      return;
    }

    if (!user.roles.includes('admin')) {
      reply.code(403);
      reply.send({ error: 'Admin role required' });
      return;
    }

    // Adjuntar info al request
    request.admin = {
      user_id: result.user_id,
      session_id: result.session_id!,
      username: user.username,
    };
  } catch {
    reply.code(401);
  }
}

// ------------------------------------------------------------------
// Type augmentation para request.admin
// ------------------------------------------------------------------
declare module 'fastify' {
  interface FastifyRequest {
    admin?: {
      user_id: string;
      session_id: string;
      username: string;
    };
    user_id?: string;
    session_id?: string;
  }
}