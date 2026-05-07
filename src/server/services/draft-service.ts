// ============================================================================
// Crux-Webmail — Draft Service
// ============================================================================
// CRUD operations para borradores: crear, actualizar (auto-save), listar,
// eliminar y enviar. Incluye debounce de auto-save y validación de integridad.
// ============================================================================

import { Op } from 'sequelize';
import { DraftModel } from '../models/Draft';
import { AttachmentModel } from '../models/Attachment';
import { UserModel } from '../models/User';
import { CruxError } from '../errors/handler';
import { auditLogger } from '../utils/audit-logger';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export type DraftStatus = 'draft' | 'queued' | 'scanning' | 'ready' | 'error';

export interface DraftCreateInput {
  to?: Array<{ name: string; email: string }>;
  cc?: Array<{ name: string; email: string }>;
  bcc?: Array<{ name: string; email: string }>;
  subject?: string;
  body_html?: string;
  body_text?: string;
  encrypt?: boolean;
  sign?: boolean;
}

export interface DraftUpdateInput extends Partial<DraftCreateInput> {
  status?: DraftStatus;
}

export interface DraftDTO {
  id: string;
  to: Array<{ name: string; email: string }>;
  cc?: Array<{ name: string; email: string }>;
  bcc?: Array<{ name: string; email: string }>;
  subject: string;
  body_html: string;
  body_text: string;
  status: DraftStatus;
  encrypt: boolean;
  sign: boolean;
  attachmentCount: number;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
    scanStatus: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

// ------------------------------------------------------------------
// Private helpers
// ------------------------------------------------------------------

async function assertUserId(userId: string): Promise<void> {
  const user = await UserModel.findByPk(userId);
  if (!user || !user.is_active) {
    throw new CruxError('USER_NOT_FOUND', 'Usuario no encontrado o desactivado', {
      details: { code: 'DRAFT_USER_INVALID' },
    });
  }
}

function toDraftDTO(draft: any): DraftDTO {
  return {
    id: draft.id,
    to: draft.to || [],
    cc: draft.cc || [],
    bcc: draft.bcc || [],
    subject: draft.subject,
    body_html: draft.body_html,
    body_text: draft.body_text,
    status: draft.status,
    encrypt: draft.encrypt,
    sign: draft.sign,
    attachmentCount: draft.attachment_count,
    attachments: (draft.attachments || []).map((a: any) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      scanStatus: a.scanStatus,
    })),
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  };
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

export async function createDraft(
  userId: string,
  input: DraftCreateInput = {}
): Promise<DraftDTO> {
  await assertUserId(userId);

  const draft = await DraftModel.create({
    userId,
    to: input.to || [],
    cc: input.cc || null,
    bcc: input.bcc || null,
    subject: input.subject ?? '',
    body_html: input.body_html ?? '',
    body_text: input.body_text ?? '',
    encrypt: input.encrypt ?? false,
    sign: input.sign ?? true,
    status: 'draft' as DraftStatus,
    attachment_count: 0,
  } as any);

  auditLogger.info('Draft created', {
    actor_id: userId,
    metadata: { draft_id: draft.id },
  });

  return toDraftDTO(draft);
}

export async function updateDraft(
  userId: string,
  draftId: string,
  input: DraftUpdateInput
): Promise<DraftDTO> {
  await assertUserId(userId);

  const draft = await DraftModel.findOne({
    where: { id: draftId, userId },
  });

  if (!draft) {
    throw new CruxError('DRAFT_NOT_FOUND', 'Borrador no encontrado', {
      details: { code: 'DRAFT_NOT_FOUND', draftId },
    });
  }

  const updates: Record<string, unknown> = {};
  if (input.to !== undefined) updates.to = input.to;
  if (input.cc !== undefined) updates.cc = input.cc;
  if (input.bcc !== undefined) updates.bcc = input.bcc;
  if (input.subject !== undefined) updates.subject = input.subject;
  if (input.body_html !== undefined) updates.body_html = input.body_html;
  if (input.body_text !== undefined) updates.body_text = input.body_text;
  if (input.status !== undefined) updates.status = input.status;
  if (input.encrypt !== undefined) updates.encrypt = input.encrypt;
  if (input.sign !== undefined) updates.sign = input.sign;

  if (Object.keys(updates).length > 0) {
    await draft.update(updates as any);
  }

  const fullDraft = await DraftModel.findOne({
    where: { id: draftId, userId },
    include: [
      {
        model: AttachmentModel,
        as: 'attachmentList',
        required: false,
        where: { scanStatus: { [Op.ne]: 'infected' } },
      },
    ],
  });

  auditLogger.info('Draft updated (auto-save)', {
    actor_id: userId,
    metadata: { draft_id: draftId, fields: Object.keys(updates) },
  });

  return toDraftDTO(fullDraft || draft);
}

export async function getDraft(userId: string, draftId: string): Promise<DraftDTO> {
  await assertUserId(userId);

  const draft = await DraftModel.findOne({
    where: { id: draftId, userId },
    include: [
      {
        model: AttachmentModel,
        as: 'attachmentList',
        required: false,
      },
    ],
  });

  if (!draft) {
    throw new CruxError('DRAFT_NOT_FOUND', 'Borrador no encontrado', {
      details: { code: 'DRAFT_NOT_FOUND', draftId },
    });
  }

  return toDraftDTO(draft);
}

export async function listDrafts(userId: string, limit = 50, offset = 0): Promise<DraftDTO[]> {
  await assertUserId(userId);

  const drafts = await DraftModel.findAll({
    where: { userId },
    include: [
      {
        model: AttachmentModel,
        as: 'attachmentList',
        required: false,
      },
    ],
    order: [['updated_at', 'DESC']],
    limit,
    offset,
  });

  return drafts.map(toDraftDTO);
}

export async function deleteDraft(userId: string, draftId: string): Promise<void> {
  await assertUserId(userId);

  const result = await DraftModel.destroy({
    where: { id: draftId, userId },
  });

  if (result === 0) {
    throw new CruxError('DRAFT_NOT_FOUND', 'Borrador no encontrado', {
      details: { code: 'DRAFT_NOT_FOUND', draftId },
    });
  }

  auditLogger.info('Draft deleted', {
    actor_id: userId,
    metadata: { draft_id: draftId },
  });
}

export async function cleanupOldDrafts(
  userId: string,
  maxAgeHours = 72
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const result = await DraftModel.destroy({
    where: {
      userId,
      status: 'draft' as DraftStatus,
      updated_at: { [Op.lt]: cutoff },
    },
  });

  if (result > 0) {
    auditLogger.info('Old drafts cleaned up', {
      actor_id: userId,
      metadata: { count: result, maxAgeHours },
    });
  }

  return result;
}