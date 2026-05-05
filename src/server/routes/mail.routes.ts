// ============================================================================
// Crux-Webmail — Mail Routes (/api/mail)
// ============================================================================

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { JMAPMailService } from '../modules/mail/jmap-client.service';
import { createValidationError } from '../errors/handler';

// ------------------------------------------------------------------
// Schemas
// ------------------------------------------------------------------
const SendEmailSchema = z.object({
  from: z.string().email(),
  to: z.array(z.string().email()),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(998),
  text: z.string(),
  html: z.string().optional(),
});

const MailQuerySchema = z.object({
  conditions: z.record(z.string(), z.array(z.string())).optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  position: z.number().int().min(0).optional().default(0),
});

const MailGetSchema = z.object({
  ids: z.array(z.string()).min(1),
});

// ------------------------------------------------------------------
// Register all mail routes (require auth middleware)
// ------------------------------------------------------------------
export async function registerMailRoutes(fastify: FastifyInstance): Promise<void> {
  const mailService = new JMAPMailService();

  // GET /api/mail/boxes — list mailboxes
  fastify.get('/boxes', async (request: any) => {
    const userId = request.secureContext.user_id;
    const mailboxes = await mailService.getMailboxes(userId);
    return { list: mailboxes, correlation_id: request.id };
  });

  // POST /api/mail/query — search messages
  fastify.post('/query', async (request: any) => {
    const body = request.body as Record<string, unknown>;
    const parsed = MailQuerySchema.safeParse(body);

    if (!parsed.success) {
      throw createValidationError('Invalid mail query', {
        errors: parsed.error.issues.map((e: any) => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    const userId = request.secureContext.user_id;
    const result = await mailService.query(userId, parsed.data);
    return { ...result, correlation_id: request.id };
  });

  // POST /api/mail/get — retrieve messages
  fastify.post('/get', async (request: any) => {
    const body = request.body as Record<string, unknown>;
    const parsed = MailGetSchema.safeParse(body);

    if (!parsed.success) {
      throw createValidationError('Invalid mail get request');
    }

    const userId = request.secureContext.user_id;
    const result = await mailService.get(userId, parsed.data);
    return { list: result.list, correlation_id: request.id };
  });

  // POST /api/mail/send — compose and send
  fastify.post('/send', async (request: any) => {
    const body = request.body as Record<string, unknown>;
    const parsed = SendEmailSchema.safeParse(body);

    if (!parsed.success) {
      throw createValidationError('Invalid mail send request', {
        errors: parsed.error.issues.map((e: any) => ({ field: e.path.join('.'), message: e.message })),
      });
    }

    const userId = request.secureContext.user_id;
    const result = await mailService.sendEmail(userId, parsed.data);
    return {
      status: 200,
      envelope_id: result.envelopeId,
      accepted: result.accepted,
      rejected: result.rejected,
      dkim_signed: result.dkimSigned,
      tls_used: result.tlsUsed,
      correlation_id: request.id,
    };
  });

  // POST /api/mail/set — bulk operations (JMAP)
  fastify.post('/set', async (request: any) => {
    const body = request.body as Record<string, unknown>;
    const userId = request.secureContext.user_id;
    const result = await mailService.set(userId, body);
    return { ...result, correlation_id: request.id };
  });
}