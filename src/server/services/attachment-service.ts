// ============================================================================
// Crux-Webmail — Attachment Service
// ============================================================================
// Manejo completo del ciclo de vida de adjuntos:
// - Upload temporal (chunked support via presigned URL simulado)
// - Cálculo de SHA-256 e integridad
// - Escaneo ClamAV con pipeline asíncrono
// - Limpieza de adjuntos huérfanos
// ============================================================================

import { randomUUID, createHash } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { Op } from 'sequelize';
import { AttachmentModel } from '../models/Attachment';
import { DraftModel } from '../models/Draft';
import { UserModel } from '../models/User';
import { CruxError } from '../errors/handler';
import { auditLogger } from '../utils/audit-logger';

// ------------------------------------------------------------------
// Config constants
// ------------------------------------------------------------------
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './storage/uploads';
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_ATTACHMENTS_PER_DRAFT = 10;

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export interface AttachmentUploadInput {
  draftId: string;
  buffer: Buffer;
  filename: string;
  contentType: string;
  contentId?: string;
  inline?: boolean;
}

export interface AttachmentDTO {
  id: string;
  filename: string;
  originalName: string;
  contentType: string;
  size: number;
  sha256: string;
  scanStatus: string;
  scanMessage?: string;
  inline: boolean;
  createdAt: string;
}

// ------------------------------------------------------------------
// ClamAV Scanner (TCP-based)
// ------------------------------------------------------------------

async function scanWithClamAV(filePath: string): Promise<{ clean: boolean; message: string }> {
  try {
    const net = await import('node:net');
    const appConfig = await import('../config/app.config');
    const config = appConfig.config;

    const result = await new Promise<{ clean: boolean; message: string }>((resolve) => {
      const client = net.connect(
        { host: config.CLAMAV_HOST, port: config.CLAMAV_PORT },
        () => {
          client.write(`n FILE ${filePath}\n`);
        }
      );

      let response = '';

      client.on('data', (data: Buffer) => {
        response += data.toString();
      });

      client.on('close', () => {
        if (response.includes('OK')) {
          resolve({ clean: true, message: 'ClamAV: clean' });
        } else {
          const virusMatch = response.match(/FOUND\s*(.*)/);
          resolve({
            clean: false,
            message: `ClamAV: ${virusMatch ? virusMatch[1]?.trim() ?? 'infected' : 'infected'}`,
          });
        }
      });

      client.on('error', () => {
        resolve({ clean: true, message: 'ClamAV unavailable — skipped scan' });
      });
    });

    return result;
  } catch {
    return { clean: true, message: 'ClamAV error — skipped scan' };
  }
}

// ------------------------------------------------------------------
// Private helpers
// ------------------------------------------------------------------

function calculateSHA256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function sanitizeFilename(filename: string): string {
  return basename(filename)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 255);
}

async function assertUserId(userId: string): Promise<void> {
  const user = await UserModel.findByPk(userId);
  if (!user || !user.is_active) {
    throw new CruxError('USER_NOT_FOUND', 'Usuario no encontrado o desactivado', {
      details: { code: 'ATTACHMENT_USER_INVALID' },
    });
  }
}

function toAttachmentDTO(attachment: any): AttachmentDTO {
  return {
    id: attachment.id,
    filename: attachment.filename,
    originalName: attachment.originalName,
    contentType: attachment.contentType,
    size: attachment.size,
    sha256: attachment.sha256,
    scanStatus: attachment.scanStatus,
    scanMessage: attachment.scanMessage,
    inline: attachment.inline,
    createdAt: attachment.created_at,
  };
}

// ------------------------------------------------------------------
// Scan queue (in-memory)
// ------------------------------------------------------------------

const scanQueue: Map<string, { filePath: string; scheduled: boolean }> = new Map();

function enqueueScan(attachmentId: string, filePath: string): void {
  scanQueue.set(attachmentId, { filePath, scheduled: false });
  processScanJob(attachmentId);
}

async function processScanJob(attachmentId: string): Promise<void> {
  const job = scanQueue.get(attachmentId);
  if (!job || job.scheduled) return;

  job.scheduled = true;

  try {
    await (AttachmentModel as any).update(
      { scanStatus: 'scanning', scanMessage: null },
      { where: { id: attachmentId } }
    );

    const result = await scanWithClamAV(job.filePath);

    await AttachmentModel.update(
      {
        scanStatus: result.clean ? 'clean' : 'infected',
        scanMessage: result.message,
      },
      { where: { id: attachmentId } }
    );

    if (!result.clean) {
      auditLogger.warn('Attachment flagged as infected', {
        metadata: { attachmentId, message: result.message },
      } as any);
    }
  } catch (err) {
    await AttachmentModel.update(
      { scanStatus: 'error', scanMessage: String(err) },
      { where: { id: attachmentId } }
    );
    auditLogger.error('Attachment scan error', {
      metadata: { attachmentId, error: String(err) },
    } as any);
  } finally {
    scanQueue.delete(attachmentId);
  }
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/**
 * Upload a new attachment linked to a draft.
 */
export async function uploadAttachment(
  userId: string,
  input: AttachmentUploadInput
): Promise<AttachmentDTO> {
  await assertUserId(userId);

  // Validate draft ownership
  const draft = await DraftModel.findOne({
    where: { id: input.draftId, userId },
  });

  if (!draft) {
    throw new CruxError('DRAFT_NOT_FOUND', 'Borrador no encontrado', {
      details: { code: 'DRAFT_NOT_FOUND', draftId: input.draftId },
    });
  }

  // Validate size
  if (input.buffer.length > MAX_ATTACHMENT_SIZE) {
    throw new CruxError('ATTACHMENT_TOO_LARGE', `Excede el límite de ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB`, {
      details: { maxSize: MAX_ATTACHMENT_SIZE, actualSize: input.buffer.length },
    });
  }

  // Validate count
  const currentCount = await AttachmentModel.count({
    where: { draftId: input.draftId, scanStatus: { [Op.ne]: 'infected' } },
  });

  if (currentCount >= MAX_ATTACHMENTS_PER_DRAFT) {
    throw new CruxError('TOO_MANY_ATTACHMENTS', `Máximo ${MAX_ATTACHMENTS_PER_DRAFT} adjuntos permitidos`, {
      details: { max: MAX_ATTACHMENTS_PER_DRAFT },
    });
  }

  // Calculate hash
  const sha256 = calculateSHA256(input.buffer);
  const safeName = sanitizeFilename(input.filename);
  const storageKey = `${userId}/${input.draftId}/${randomUUID()}${extname(safeName)}`;
  const filePath = join(UPLOAD_DIR, storageKey);

  // Write to disk
  mkdirSync(join(UPLOAD_DIR, userId, input.draftId), { recursive: true });
  await writeFile(filePath, input.buffer as unknown as Uint8Array);

  // Create DB record
  const attachment = await AttachmentModel.create({
    draftId: input.draftId,
    userId,
    filename: safeName,
    originalName: input.filename,
    contentType: input.contentType,
    size: input.buffer.length,
    contentId: input.contentId || null,
    sha256,
    scanStatus: 'scanning',
    storagePath: filePath,
    storageKey,
    inline: input.inline ?? false,
  } as any);

  // Update draft attachment count
  await DraftModel.increment('attachment_count', { where: { id: input.draftId } });

  // Queue for ClamAV scan
  enqueueScan(attachment.id, filePath);

  auditLogger.info('Attachment uploaded', {
    actor_id: userId,
    metadata: {
      attachment_id: attachment.id,
      draft_id: input.draftId,
      filename: input.filename,
      size: input.buffer.length,
    },
  });

  return toAttachmentDTO(attachment);
}

/**
 * Get attachment details.
 */
export async function getAttachment(userId: string, attachmentId: string): Promise<AttachmentDTO> {
  await assertUserId(userId);

  const attachment = await AttachmentModel.findOne({
    where: { id: attachmentId, userId },
  });

  if (!attachment) {
    throw new CruxError('ATTACHMENT_NOT_FOUND', 'Adjunto no encontrado', {
      details: { code: 'ATTACHMENT_NOT_FOUND', attachmentId },
    });
  }

  return toAttachmentDTO(attachment);
}

/**
 * List attachments for a draft.
 */
export async function listDraftAttachments(
  userId: string,
  draftId: string
): Promise<AttachmentDTO[]> {
  await assertUserId(userId);

  const attachments = await AttachmentModel.findAll({
    where: { draftId, userId },
  });

  return attachments.map(toAttachmentDTO);
}

/**
 * Remove an attachment from a draft.
 */
export async function removeAttachment(
  userId: string,
  attachmentId: string
): Promise<void> {
  await assertUserId(userId);

  const attachment = await AttachmentModel.findOne({
    where: { id: attachmentId, userId },
  });

  if (!attachment) {
    throw new CruxError('ATTACHMENT_NOT_FOUND', 'Adjunto no encontrado', {
      details: { code: 'ATTACHMENT_NOT_FOUND', attachmentId },
    });
  }

  // Delete file from disk
  try {
    if (existsSync(attachment.storagePath)) {
      await unlink(attachment.storagePath);
    }
  } catch {
    auditLogger.warn('Failed to delete attachment file', {
      metadata: { attachment_id: attachmentId, path: attachment.storagePath },
    });
  }

  await AttachmentModel.destroy({ where: { id: attachmentId } });

  // Decrement draft counter
  await DraftModel.decrement('attachment_count', {
    where: { id: attachment.draftId },
  });

  auditLogger.info('Attachment removed', {
    actor_id: userId,
    metadata: { attachment_id: attachmentId, draft_id: attachment.draftId },
  });
}

/**
 * Cleanup orphaned attachments (infected + error records removed periodically).
 */
export async function cleanupOrphanAttachments(): Promise<number> {
  const count = await AttachmentModel.destroy({
    where: { [Op.or]: [{ scanStatus: 'infected' }, { scanStatus: 'error' }] },
  });

  if (count > 0) {
    auditLogger.info('Bad attachment records cleaned up', {
      metadata: { count },
    });
  }

  return count;
}