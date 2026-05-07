// ============================================================================
// Crux-Webmail — Draft & Attachment Controller (Business Logic Layer)
// ============================================================================
// Orquesta servicios de borrador/adjunto, valida propiedad, serializa DTOs,
// y aplica Zero-Trust: cada acción exige userId + ownership check.
// ============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { CruxError } from '../../errors/handler';
import { auditLogger } from '../../utils/audit-logger';
import {
  createDraft,
  updateDraft,
  getDraft,
  listDrafts,
  deleteDraft,
  cleanupOldDrafts,
  DraftCreateInput,
  DraftUpdateInput,
  DraftDTO,
} from '../../services/draft-service';
import {
  uploadAttachment,
  getAttachment,
  listDraftAttachments,
  removeAttachment,
  cleanupOrphanAttachments,
  AttachmentUploadInput,
  AttachmentDTO,
} from '../../services/attachment-service';
import { UserModel } from '../../models/User';

// ------------------------------------------------------------------
// Auth helper — extracts userId from JWT token via Fastify auth plugin
// ------------------------------------------------------------------
function extractUserId(request: FastifyRequest): string {
  const userId = (request as any).userId ?? (request as any).user?.id;
  if (!userId) {
    throw new CruxError('UNAUTHORIZED', 'No se proporcionó usuario autenticado', {
      details: { code: 'DRAFT_UNAUTHORIZED' },
    });
  }
  return userId;
}

// ------------------------------------------------------------------
// Draft CRUD
// ------------------------------------------------------------------

export async function handleCreateDraft(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<DraftDTO> {
  const userId = extractUserId(request);
  const input = request.body as DraftCreateInput;

  const draft = await createDraft(userId, input);

  return reply.code(201).send(draft);
}

export async function handleGetDraft(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<DraftDTO> {
  const userId = extractUserId(request);
  const { draftId } = request.params as { draftId: string };

  if (!draftId || typeof draftId !== 'string') {
    throw new CruxError('INVALID_PARAMS', 'ID de borrador requerido', {
      details: { code: 'DRAFT_INVALID_ID' },
    });
  }

  const draft = await getDraft(userId, draftId);
  return reply.send(draft);
}

export async function handleUpdateDraft(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<DraftDTO> {
  const userId = extractUserId(request);
  const { draftId } = request.params as { draftId: string };
  const input = request.body as DraftUpdateInput;

  if (!draftId || typeof draftId !== 'string') {
    throw new CruxError('INVALID_PARAMS', 'ID de borrador requerido', {
      details: { code: 'DRAFT_INVALID_ID' },
    });
  }

  const draft = await updateDraft(userId, draftId, input);
  return reply.send(draft);
}

export async function handleListDrafts(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<DraftDTO[]> {
  const userId = extractUserId(request);
  const { limit, offset } = request.query as { limit?: number; offset?: number };

  const drafts = await listDrafts(userId, limit ?? 50, offset ?? 0);
  return reply.send(drafts);
}

export async function handleDeleteDraft(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ status: string; id: string }> {
  const userId = extractUserId(request);
  const { draftId } = request.params as { draftId: string };

  if (!draftId || typeof draftId !== 'string') {
    throw new CruxError('INVALID_PARAMS', 'ID de borrador requerido', {
      details: { code: 'DRAFT_INVALID_ID' },
    });
  }

  await deleteDraft(userId, draftId);

  auditLogger.info('Draft deleted via API', {
    actor_id: userId,
    metadata: { draft_id: draftId },
  });

  return reply.send({ status: 'deleted', id: draftId });
}

export async function handleCleanupDrafts(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ cleaned: number }> {
  const userId = extractUserId(request);
  const { maxAgeHours } = request.query as { maxAgeHours?: number };

  const cleaned = await cleanupOldDrafts(userId, maxAgeHours ?? 72);

  auditLogger.info('Draft cleanup executed', {
    actor_id: userId,
    metadata: { cleaned, maxAgeHours: maxAgeHours ?? 72 },
  });

  return reply.send({ cleaned });
}

// ------------------------------------------------------------------
// Attachment CRUD
// ------------------------------------------------------------------

export async function handleUploadAttachment(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AttachmentDTO> {
  const userId = extractUserId(request);
  const { draftId } = request.params as { draftId: string };

  if (!draftId || typeof draftId !== 'string') {
    throw new CruxError('INVALID_PARAMS', 'ID de borrador requerido', {
      details: { code: 'ATTACHMENT_INVALID_DRAFT' },
    });
  }

  // Parse multipart form data
  const data = await request.file({
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB
    },
  });

  const input: AttachmentUploadInput = {
    draftId,
    buffer: data.buffer,
    filename: data.filename,
    contentType: data.mimetype,
  };

  const attachment = await uploadAttachment(userId, input);

  return reply.code(201).send(attachment);
}

export async function handleGetAttachment(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AttachmentDTO> {
  const userId = extractUserId(request);
  const { attachmentId } = request.params as { attachmentId: string };

  if (!attachmentId || typeof attachmentId !== 'string') {
    throw new CruxError('INVALID_PARAMS', 'ID de adjunto requerido', {
      details: { code: 'ATTACHMENT_INVALID_ID' },
    });
  }

  const attachment = await getAttachment(userId, attachmentId);
  return reply.send(attachment);
}

export async function handleListDraftAttachments(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AttachmentDTO[]> {
  const userId = extractUserId(request);
  const { draftId } = request.params as { draftId: string };

  if (!draftId || typeof draftId !== 'string') {
    throw new CruxError('INVALID_PARAMS', 'ID de borrador requerido', {
      details: { code: 'ATTACHMENT_INVALID_DRAFT' },
    });
  }

  const attachments = await listDraftAttachments(userId, draftId);
  return reply.send(attachments);
}

export async function handleRemoveAttachment(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ status: string; id: string }> {
  const userId = extractUserId(request);
  const { attachmentId } = request.params as { attachmentId: string };

  if (!attachmentId || typeof attachmentId !== 'string') {
    throw new CruxError('INVALID_PARAMS', 'ID de adjunto requerido', {
      details: { code: 'ATTACHMENT_INVALID_ID' },
    });
  }

  await removeAttachment(userId, attachmentId);

  auditLogger.info('Attachment removed via API', {
    actor_id: userId,
    metadata: { attachment_id: attachmentId },
  });

  return reply.send({ status: 'deleted', id: attachmentId });
}

export async function handleCleanupAttachments(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ cleaned: number }> {
  const userId = extractUserId(request);

  const cleaned = await cleanupOrphanAttachments();

  auditLogger.info('Attachment cleanup executed', {
    actor_id: userId,
    metadata: { cleaned },
  });

  return reply.send({ cleaned });
}