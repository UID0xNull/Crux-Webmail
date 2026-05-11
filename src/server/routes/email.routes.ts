// ============================================================================
// Crux-Webmail — Email Routes (/api/email)
// ============================================================================
// Endpoints REST para operaciones de correo: listar, buscar, leer, enviar,
// marcar, mover, eliminar. Validación estricta con Zod + delegación al
// controller (business logic). Zero-Trust: cada ruta requiere auth.
//
// Formato unificado: todas las respuestas siguen ApiResponse<T>:
//   { data?: T; error?: ApiError; correlation_id: string }
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { CruxError } from 'errors/handler';
import { sendSuccess, sendError } from 'utils/api-response';

// Controller (business logic)
import * as emailCtrl from 'modules/email/email.controller';

type RequestWithUser = FastifyRequest & { user_id?: string; secureContext?: { user_id?: string }; ip: string };

// ------------------------------------------------------------------
// Validation Schemas (Zod)
// ------------------------------------------------------------------

const SearchQuerySchema = z.object({
  folder: z.string().default('INBOX'),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  from: z.string().email().optional(),
  to: z.string().email().optional(),
  subject: z.string().optional(),
  unread: z.coerce.boolean().default(false),
  flagged: z.coerce.boolean().default(false),
  hasAttachments: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

const EmailUidParamsSchema = z.object({
  uid: z.coerce.number().int().positive(),
});

const MarkFlagBodySchema = z.object({
  uid: z.number().int().positive(),
  folder: z.string().min(1).max(256),
  flag: z.enum(['SEEN', 'UNSEEN', 'FLAGGED', 'UNFLAGGED', 'DELETED']),
});

const MoveEmailBodySchema = z.object({
  uid: z.number().int().positive(),
  fromFolder: z.string().min(1).max(256),
  toFolder: z.string().min(1).max(256),
});

const DeleteEmailBodySchema = z.object({
  folder: z.string().min(1).max(256),
});

const SendEmailBodySchema = z.object({
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(256),
  text: z.string().max(1_000_000),
  html: z.string().max(1_000_000).optional(),
  cc: z.array(z.string().email()).max(50).optional(),
  bcc: z.array(z.string().email()).max(50).optional(),
  replyTo: z.string().email().optional(),
});

const BulkFlagBodySchema = z.object({
  uids: z.array(z.number().int().positive()).min(1).max(500),
  folder: z.string().min(1).max(256),
  flag: z.enum(['SEEN', 'UNSEEN', 'FLAGGED', 'UNFLAGGED', 'DELETED']),
});

const BulkMoveBodySchema = z.object({
  uids: z.array(z.number().int().positive()).min(1).max(500),
  folder: z.string().min(1).max(256),
  toFolder: z.string().min(1).max(256),
});

// ------------------------------------------------------------------
// User ID resolver
// ------------------------------------------------------------------
function getUserId(request: FastifyRequest): string {
  const r = request as RequestWithUser;
  const userId = r.user_id || (r.secureContext && (r.secureContext as any).user_id);
  if (!userId) {
    throw new CruxError('MISSING_USER_CONTEXT', 'No se pudo determinar el usuario autenticado', {
      details: { code: 'AUTH_CONTEXT_MISSING' },
    });
  }
  return userId as string;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function handleEmailError(err: unknown, reply: FastifyReply) {
  if (err instanceof CruxError) {
    const status = err.code.includes('IMAP') ? 503 : 500;
    return sendError(reply, status, err.code, String(err.message), { details: (err as any).details });
  }
  throw err;
}

function handleValidationError(err: z.ZodError, reply: FastifyReply) {
  return sendError(reply, 400, 'INVALID_QUERY_PARAMS', 'Parámetros inválidos', {
    details: { errors: err.errors },
  });
}

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------
export async function registerEmailRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /folders
  fastify.get(
    '/folders',
    {
      description: 'List IMAP folders for the user',
      tags: ['email'],
      schema: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);
      try {
        const folders = await emailCtrl.listUserFolders(userId);
        return sendSuccess(reply, folders);
      } catch (err) {
        return handleEmailError(err, reply);
      }
    }
  );

  // GET /search
  fastify.get(
    '/search',
    {
      config: { rateLimit: { max: 120, timeWindow: '60000' } },
      description: 'Search emails with pagination',
      tags: ['email'],
      schema: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);
      try {
        // parse query
        const parsed = SearchQuerySchema.parse(request.query);
        // extract limit before passing filter to searchEmails
        const pageLimit = parsed.limit || 20;
        const filterWithoutLimit = { ...parsed };
        // make it explicitly optional-safe by constructing a new object
        const filter: any = {
          folder: filterWithoutLimit.folder,
          since: filterWithoutLimit.since,
          until: filterWithoutLimit.until,
          from: filterWithoutLimit.from,
          to: filterWithoutLimit.to,
          subject: filterWithoutLimit.subject,
          unread: filterWithoutLimit.unread,
          flagged: filterWithoutLimit.flagged,
          hasAttachments: filterWithoutLimit.hasAttachments,
        };

        const result = await emailCtrl.searchEmails(
          userId,
          filter,
          parsed.cursor,
          pageLimit,
        );
        return sendSuccess(reply, result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return handleValidationError(err, reply);
        }
        return handleEmailError(err, reply);
      }
    }
  );

  // GET /:uid
  fastify.get(
    '/:uid',
    {
      description: 'Read email by UID',
      tags: ['email'],
      schema: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);
      try {
        const parsedParams = EmailUidParamsSchema.parse(request.params as any);
        const uid = parsedParams.uid;
        const folder = (request.query as Record<string, string> | undefined)?.folder || 'INBOX';

        const detail = await emailCtrl.getEmailByUID(userId, folder, uid);
        return sendSuccess(reply, detail);
      } catch (err) {
        if (err instanceof CruxError) {
          const code = err.code === 'MESSAGE_NOT_FOUND' ? 404 : 503;
          return sendError(reply, code, err.code, String(err.message), { details: (err as any).details });
        }
        throw err;
      }
    }
  );

  // POST /flag
  fastify.post(
    '/flag',
    {
      description: 'Mark/unmark email flags',
      tags: ['email'],
      schema: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);
      try {
        const body = MarkFlagBodySchema.parse(request.body as any);
        const result = await emailCtrl.toggleEmailFlag(userId, body);
        return sendSuccess(reply, result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return handleValidationError(err, reply);
        }
        return handleEmailError(err, reply);
      }
    }
  );

  // POST /move
  fastify.post(
    '/move',
    {
      description: 'Move email to another folder',
      tags: ['email'],
      schema: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);
      try {
        const body = MoveEmailBodySchema.parse(request.body as any);
        const result = await emailCtrl.moveUserEmail(userId, body);
        return sendSuccess(reply, result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return handleValidationError(err, reply);
        }
        return handleEmailError(err, reply);
      }
    }
  );

  // DELETE /:uid
  fastify.delete(
    '/:uid',
    {
      description: 'Delete an email permanently',
      tags: ['email'],
      schema: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);
      try {
        const parsedParams = EmailUidParamsSchema.parse(request.params as any);
        const uid = parsedParams.uid;
        const body = DeleteEmailBodySchema.parse(request.body as any);

        const result = await emailCtrl.deleteUserEmail(userId, {
          uid,
          folder: body.folder,
        });
        return sendSuccess(reply, result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return handleValidationError(err, reply);
        }
        return handleEmailError(err, reply);
      }
    }
  );

  // POST /send
  fastify.post(
    '/send',
    {
      config: { rateLimit: { max: 30, timeWindow: '60000' } },
      description: 'Send email (async)',
      tags: ['email'],
      schema: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);
      try {
        const body = SendEmailBodySchema.parse(request.body as any);
        const result = await emailCtrl.queueEmailSend(userId, body);
        return sendSuccess(reply, result, 202);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return handleValidationError(err, reply);
        }
        return handleEmailError(err, reply);
      }
    }
  );

  // POST /bulk/flag
  fastify.post(
    '/bulk/flag',
    {
      config: { rateLimit: { max: 10, timeWindow: '60000' } },
      description: 'Bulk flag emails',
      tags: ['email', 'bulk'],
      schema: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);
      try {
        const body = BulkFlagBodySchema.parse(request.body as any);
        const result = await emailCtrl.bulkMarkFlags(userId, body);
        return sendSuccess(reply, result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return handleValidationError(err, reply);
        }
        return handleEmailError(err, reply);
      }
    }
  );

  // POST /bulk/move
  fastify.post(
    '/bulk/move',
    {
      config: { rateLimit: { max: 10, timeWindow: '60000' } },
      description: 'Bulk move emails',
      tags: ['email', 'bulk'],
      schema: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);
      try {
        const body = BulkMoveBodySchema.parse(request.body as any);
        const result = await emailCtrl.bulkMoveEmails(userId, body);
        return sendSuccess(reply, result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return handleValidationError(err, reply);
        }
        return handleEmailError(err, reply);
      }
    }
  );

  // POST /sync
  fastify.post(
    '/sync',
    {
      config: { rateLimit: { max: 5, timeWindow: '300000' } },
      description: 'Trigger IMAP sync for user',
      tags: ['email', 'sync'],
      schema: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);
      try {
        const result = await emailCtrl.triggerSync(userId);
        return sendSuccess(reply, result);
      } catch (err) {
        return handleEmailError(err, reply);
      }
    }
  );

  // GET /sync/status
  fastify.get(
    '/sync/status',
    {
      description: 'Get IMAP sync status for user',
      tags: ['email', 'sync'],
      schema: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);
      try {
        const status = await emailCtrl.getSyncStatus(userId);
        return sendSuccess(reply, status);
      } catch (err) {
        return handleEmailError(err, reply);
      }
    }
  );

  // DELETE /connection
  fastify.delete(
    '/connection',
    {
      description: 'Close user IMAP connection',
      tags: ['email', 'connection'],
      schema: {},
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserId(request);
      try {
        const result = await emailCtrl.closeIMAPConnection(userId);
        return sendSuccess(reply, result);
      } catch (err) {
        return handleEmailError(err, reply);
      }
    }
  );
}