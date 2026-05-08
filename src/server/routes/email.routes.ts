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

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CruxError } from 'errors/handler';
import { sendSuccess, sendError } from 'utils/api-response';

// Controller (business logic)
import * as emailCtrl from 'modules/email/email.controller';

// ------------------------------------------------------------------
// Validation Schemas (Zod)
// ------------------------------------------------------------------

/** GET /search — filtros de búsqueda de correos */
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
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

/** GET /:uid — params para obtener un correo por UID */
const EmailUidParamsSchema = z.object({
  uid: z.coerce.number().int().positive(),
});

/** POST /flag — marcar un correo */
const MarkFlagBodySchema = z.object({
  uid: z.number().int().positive(),
  folder: z.string().min(1).max(256),
  flag: z.enum(['SEEN', 'UNSEEN', 'FLAGGED', 'UNFLAGGED', 'DELETED']),
});

/** POST /move — mover un correo entre carpetas */
const MoveEmailBodySchema = z.object({
  uid: z.number().int().positive(),
  fromFolder: z.string().min(1).max(256),
  toFolder: z.string().min(1).max(256),
});

/** DELETE /:uid — eliminar un correo */
const DeleteEmailBodySchema = z.object({
  folder: z.string().min(1).max(256),
});

/** POST /send — enviar correo */
const SendEmailBodySchema = z.object({
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(256),
  text: z.string().max(1_000_000),
  html: z.string().max(1_000_000).optional(),
  cc: z.array(z.string().email()).max(50).optional(),
  bcc: z.array(z.string().email()).max(50).optional(),
  replyTo: z.string().email().optional(),
});

/** POST /bulk/flag — marcar múltiples correos */
const BulkFlagBodySchema = z.object({
  uids: z.array(z.number().int().positive()).min(1).max(500),
  folder: z.string().min(1).max(256),
  flag: z.enum(['SEEN', 'UNSEEN', 'FLAGGED', 'UNFLAGGED', 'DELETED']),
});

/** POST /bulk/move — mover múltiples correos */
const BulkMoveBodySchema = z.object({
  uids: z.array(z.number().int().positive()).min(1).max(500),
  folder: z.string().min(1).max(256),
  toFolder: z.string().min(1).max(256),
});

// ------------------------------------------------------------------
// User ID resolver (inyectado por middleware de auth en app.ts)
// ------------------------------------------------------------------
function getUserId(request: any): string {
  const userId = request.user_id || request.secureContext?.user_id;
  if (!userId) {
    throw new CruxError('MISSING_USER_CONTEXT', 'No se pudo determinar el usuario autenticado', {
      details: { code: 'AUTH_CONTEXT_MISSING' },
    });
  }
  return userId;
}

// ------------------------------------------------------------------
// Helper: manejo unificado de CruxError en cada endpoint
// ------------------------------------------------------------------
function handleEmailError(err: unknown, reply: any): any {
  if (err instanceof CruxError) {
    return sendError(reply, err.code.includes('IMAP') ? 503 : 500, err.code, err.message, {
      details: err.details,
    });
  }
  throw err;
}

function handleValidationError(err: z.ZodError, reply: any): any {
  return sendError(reply, 400, 'INVALID_QUERY_PARAMS', 'Parámetros inválidos', {
    details: { errors: err.errors },
  });
}

// ------------------------------------------------------------------
// Register Routes
// ------------------------------------------------------------------
export async function registerEmailRoutes(fastify: FastifyInstance): Promise<void> {

  // ------------------------------------------------------------------
  // GET /api/email/folders
  // Listar carpetas IMAP del usuario
  // ------------------------------------------------------------------
  fastify.get(
    '/folders',
    {
      schema: {
        summary: 'Listar carpetas IMAP del usuario',
        tags: ['email'],
      },
    },
    async (request: any, reply: any) => {
      const userId = getUserId(request);

      try {
        const folders = await emailCtrl.listUserFolders(userId);
        return sendSuccess(reply, folders);
      } catch (err) {
        return handleEmailError(err, reply);
      }
    }
  );

  // ------------------------------------------------------------------
  // GET /api/email/search
  // Buscar / listar correos con paginación cursor-based
  // ------------------------------------------------------------------
  fastify.get(
    '/search',
    {
      config: { rateLimit: { max: 120, timeWindow: '60000' } },
      schema: {
        summary: 'Buscar correos con paginación',
        tags: ['email'],
        querystring: SearchQuerySchema,
      },
    },
    async (request: any, reply: any) => {
      const userId = getUserId(request);
      const filter = SearchQuerySchema.parse(request.query);
      const pageLimit = filter.limit;
      delete filter.limit;

      try {
        const result = await emailCtrl.searchEmails(
          userId,
          filter,
          filter.cursor,
          pageLimit,
        );
        return sendSuccess(reply, result);
      } catch (err: any) {
        if (err instanceof z.ZodError) {
          return handleValidationError(err, reply);
        }
        return handleEmailError(err, reply);
      }
    }
  );

  // ------------------------------------------------------------------
  // GET /api/email/:uid
  // Leer un correo por UID
  // ------------------------------------------------------------------
  fastify.get(
    '/:uid',
    {
      schema: {
        summary: 'Leer un correo por UID',
        tags: ['email'],
        params: EmailUidParamsSchema,
      },
    },
    async (request: any, reply: any) => {
      const userId = getUserId(request);
      const { uid } = EmailUidParamsSchema.parse(request.params);
      const folder = (request.query as any).folder || 'INBOX';

      try {
        const detail = await emailCtrl.getEmailByUID(userId, folder, uid);
        return sendSuccess(reply, detail);
      } catch (err) {
        if (err instanceof CruxError) {
          const code = err.code === 'MESSAGE_NOT_FOUND' ? 404 : 503;
          return sendError(reply, code, err.code, err.message, { details: err.details });
        }
        throw err;
      }
    }
  );

  // ------------------------------------------------------------------
  // POST /api/email/flag
  // Marcar correo como leído/no leído/favorito
  // ------------------------------------------------------------------
  fastify.post(
    '/flag',
    {
      schema: {
        summary: 'Cambiar estado (flag) de un correo',
        tags: ['email'],
        body: MarkFlagBodySchema,
      },
    },
    async (request: any, reply: any) => {
      const userId = getUserId(request);
      const body = MarkFlagBodySchema.parse(request.body);

      try {
        const result = await emailCtrl.toggleEmailFlag(userId, body);
        return sendSuccess(reply, result);
      } catch (err) {
        return handleEmailError(err, reply);
      }
    }
  );

  // ------------------------------------------------------------------
  // POST /api/email/move
  // Mover correo a otra carpeta
  // ------------------------------------------------------------------
  fastify.post(
    '/move',
    {
      schema: {
        summary: 'Mover un correo a otra carpeta',
        tags: ['email'],
        body: MoveEmailBodySchema,
      },
    },
    async (request: any, reply: any) => {
      const userId = getUserId(request);
      const body = MoveEmailBodySchema.parse(request.body);

      try {
        const result = await emailCtrl.moveUserEmail(userId, body);
        return sendSuccess(reply, result);
      } catch (err) {
        return handleEmailError(err, reply);
      }
    }
  );

  // ------------------------------------------------------------------
  // DELETE /api/email/:uid
  // Eliminar correo permanentemente
  // ------------------------------------------------------------------
  fastify.delete(
    '/:uid',
    {
      schema: {
        summary: 'Eliminar un correo permanentemente',
        tags: ['email'],
        params: EmailUidParamsSchema,
        body: DeleteEmailBodySchema,
      },
    },
    async (request: any, reply: any) => {
      const userId = getUserId(request);
      const { uid } = EmailUidParamsSchema.parse(request.params);
      const body = DeleteEmailBodySchema.parse(request.body);

      try {
        const result = await emailCtrl.deleteUserEmail(userId, {
          uid,
          folder: body.folder,
        });
        return sendSuccess(reply, result);
      } catch (err) {
        return handleEmailError(err, reply);
      }
    }
  );

  // ------------------------------------------------------------------
  // POST /api/email/send
  // Enviar correo (cola async BullMQ)
  // ------------------------------------------------------------------
  fastify.post(
    '/send',
    {
      config: { rateLimit: { max: 30, timeWindow: '60000' } },
      schema: {
        summary: 'Enviar correo electrónico (async)',
        tags: ['email'],
        body: SendEmailBodySchema,
      },
    },
    async (request: any, reply: any) => {
      const userId = getUserId(request);
      const body = SendEmailBodySchema.parse(request.body);

      try {
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

  // ------------------------------------------------------------------
  // POST /api/email/bulk/flag
  // Marcar múltiples correos
  // ------------------------------------------------------------------
  fastify.post(
    '/bulk/flag',
    {
      config: { rateLimit: { max: 10, timeWindow: '60000' } },
      schema: {
        summary: 'Operación masiva: marcar correos',
        tags: ['email', 'bulk'],
        body: BulkFlagBodySchema,
      },
    },
    async (request: any, reply: any) => {
      const userId = getUserId(request);
      const body = BulkFlagBodySchema.parse(request.body);

      try {
        const result = await emailCtrl.bulkMarkFlags(userId, body);
        return sendSuccess(reply, result);
      } catch (err) {
        return handleEmailError(err, reply);
      }
    }
  );

  // ------------------------------------------------------------------
  // POST /api/email/bulk/move
  // Mover múltiples correos
  // ------------------------------------------------------------------
  fastify.post(
    '/bulk/move',
    {
      config: { rateLimit: { max: 10, timeWindow: '60000' } },
      schema: {
        summary: 'Operación masiva: mover correos',
        tags: ['email', 'bulk'],
        body: BulkMoveBodySchema,
      },
    },
    async (request: any, reply: any) => {
      const userId = getUserId(request);
      const body = BulkMoveBodySchema.parse(request.body);

      try {
        const result = await emailCtrl.bulkMoveEmails(userId, body);
        return sendSuccess(reply, result);
      } catch (err) {
        return handleEmailError(err, reply);
      }
    }
  );

  // ------------------------------------------------------------------
  // POST /api/email/sync
  // Activar sincronización IMAP
  // ------------------------------------------------------------------
  fastify.post(
    '/sync',
    {
      config: { rateLimit: { max: 5, timeWindow: '300000' } },
      schema: {
        summary: 'Activar sincronización IMAP',
        tags: ['email', 'sync'],
      },
    },
    async (request: any, reply: any) => {
      const userId = getUserId(request);

      try {
        const result = await emailCtrl.triggerSync(userId);
        return sendSuccess(reply, result);
      } catch (err) {
        return handleEmailError(err, reply);
      }
    }
  );

  // ------------------------------------------------------------------
  // GET /api/email/sync/status
  // Estado de sincronización
  // ------------------------------------------------------------------
  fastify.get(
    '/sync/status',
    {
      schema: {
        summary: 'Estado de sincronización IMAP',
        tags: ['email', 'sync'],
      },
    },
    async (request: any, reply: any) => {
      const userId = getUserId(request);

      try {
        const status = await emailCtrl.getSyncStatus(userId);
        return sendSuccess(reply, status);
      } catch (err) {
        return handleEmailError(err, reply);
      }
    }
  );

  // ------------------------------------------------------------------
  // DELETE /api/email/connection
  // Cerrar conexión IMAP del usuario
  // ------------------------------------------------------------------
  fastify.delete(
    '/connection',
    {
      schema: {
        summary: 'Cerrar conexión IMAP del usuario',
        tags: ['email', 'connection'],
      },
    },
    async (request: any, reply: any) => {
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