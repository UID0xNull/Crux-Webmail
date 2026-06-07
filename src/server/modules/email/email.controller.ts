// ============================================================================
// Crux-Webmail — Email Controller (Business Logic Layer)
// ============================================================================
// Orquesta adaptadores IMAP/SMTP, aplica paginación cursor-based,
// validación de payloads, audit trail y manejo centralizado de errores.
// Cumple Zero-Trust: cada acción valida usuario + cuenta propia.
// ============================================================================

import { CruxError } from '../../errors/handler';
import { auditLogger } from '../../utils/audit-logger';
import { UserModel } from '../../models/User';
import {
  listFolders,
  fetchEmailByUID,
  searchEmailsWithPagination,
  markEmailFlag,
  deleteEmail,
  moveEmail,
  disconnectIMAP,
  getIMAPStatus,
  IMAPAccount,
  EmailMessage,
} from './imap-service';
import { sendEmail, SendEmailOptions } from './smtp-service';
import { addEmailSendJob, addImapSyncJob, addNotificationJob, getQueueStats } from './email-queue';
import { config } from '../../config/app.config';
import {
  EmailSearchFilter,
  EmailEnvelope,
  EmailDetail,
  FolderInfo,
  MarkFlagRequest,
  MoveEmailRequest,
  DeleteEmailRequest,
  SendEmailRequest,
  SendEmailResponse,
  PaginatedResponse,
  BulkOperationRequest,
} from './types';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/**
 * Valida que el usuario exista y esté activo. Lanza CruxError si no.
 */
async function resolveUser(userId: string): Promise<UserModel> {
  const user = await UserModel.findByPk(userId);
  if (!user) {
    throw new CruxError('USER_NOT_FOUND', 'Usuario no encontrado', {
      details: { code: 'EMAIL_USER_NOT_FOUND' },
    });
  }
  if (!user.is_active) {
    throw new CruxError('ACCOUNT_DISABLED', 'La cuenta está desactivada', {
      details: { code: 'EMAIL_ACCOUNT_DISABLED' },
    });
  }
  return user;
}

/**
 * Construye config IMAP desde el modelo User + env vars.
 * En producción esto vendría de una tabla email_accounts cifrada.
 */
function buildImapAccount(userId: string, user: UserModel): IMAPAccount {
  // Auth vía MASTER USER de Dovecot: login como `usuario@dominio*masteruser`
  // con la master password. No necesitamos la contraseña real del usuario.
  // Fallback al hash sólo para no romper en entornos sin master configurado.
  const sep = config.DOVECOT_MASTER_SEPARATOR || '*';
  const username = config.DOVECOT_MASTER_USER
    ? `${user.username}${sep}${config.DOVECOT_MASTER_USER}`
    : user.username;
  return {
    id: userId,
    host: config.DOVECOT_HOST,
    port: config.DOVECOT_PORT,
    username,
    password: config.DOVECOT_MASTER_PASSWORD || user.passwordHash,
    tls: true,
  };
}

/**
 * Construye config SMTP desde el modelo User + env vars.
 */
function buildSmtpConfig(_userId: string, user: UserModel) {
  // Submission con IDENTIDAD del usuario real vía master user de Dovecot
  // (`usuario*masteruser` + master password) — igual que IMAP. Postfix exige
  // que el From coincida con el login (reject_authenticated_sender_login_mismatch),
  // así nadie puede enviar en nombre de otro. No hay cuenta de servicio compartida.
  const sep = config.DOVECOT_MASTER_SEPARATOR || '*';
  const username = config.DOVECOT_MASTER_USER
    ? `${user.username}${sep}${config.DOVECOT_MASTER_USER}`
    : user.username;
  return {
    host: config.POSTFIX_HOST,
    port: config.POSTFIX_PORT,
    secure: config.POSTFIX_PORT === 465,
    username,
    password: config.DOVECOT_MASTER_PASSWORD,
    servername: config.POSTFIX_TLS_SERVERNAME,
  };
}

/**
 * Normaliza EmailMessage → EmailEnvelope (vista ligera para listados).
 */
function toEnvelope(msg: EmailMessage): EmailEnvelope {
  return {
    uid: msg.uid,
    subject: msg.subject,
    from: msg.from,
    to: msg.to,
    date: msg.date,
    flags: msg.flags,
    hasAttachments: msg.hasAttachments,
    snippet: msg.text?.substring(0, 200) || '',
  };
}

/**
 * Normaliza EmailMessage → EmailDetail (vista completa).
 */
function toDetail(msg: EmailMessage): EmailDetail {
  return {
    uid: msg.uid,
    subject: msg.subject,
    from: msg.from,
    to: msg.to,
    date: msg.date,
    flags: msg.flags,
    hasAttachments: msg.hasAttachments,
    text: msg.text || '',
    html: msg.html || '',
    cc: msg.cc as any,
  };
}

// ------------------------------------------------------------------
// Folders
// ------------------------------------------------------------------

/**
 * LISTAR CARPETAS IMAP del usuario.
 */
export async function listUserFolders(
  userId: string,
): Promise<FolderInfo[]> {
  const user = await resolveUser(userId);
  const account = buildImapAccount(userId, user);

  try {
    const rawFolders = await listFolders(userId, account);

    return rawFolders.map(f => ({
      name: f.name || '',
      delimiter: f.delimiter || '/',
      flags: f.flags || [],
      specialUse: f.specialUse?.[0] || undefined,
    }));
  } catch (err) {
    auditLogger.error('Failed to list folders', {
      actor_id: userId,
      metadata: { error: (err as Error).message },
    });
    throw new CruxError(
      'IMAP_CONNECTION_FAILED',
      'No se pudo conectar al servidor IMAP para listar carpetas',
      { originalError: err as Error },
    );
  }
}

// ------------------------------------------------------------------
// List & Search Emails
// ------------------------------------------------------------------

/**
 * BUSCAR / LISTAR correos con paginación cursor-based.
 */
export async function searchEmails(
  userId: string,
  filter: EmailSearchFilter,
  cursor?: string,
  limit?: number,
): Promise<PaginatedResponse<EmailEnvelope>> {
  const user = await resolveUser(userId);
  const account = buildImapAccount(userId, user);
  const pageLimit = Math.min(Math.max(limit || 20, 1), 100);

  try {
    const result = await searchEmailsWithPagination(
      userId,
      account,
      filter,
      cursor,
      pageLimit,
    );

    return {
      items: result.items.map(toEnvelope),
      total: result.total,
      page: cursor ? 2 : 1,
      limit: pageLimit,
      nextCursor: result.nextCursor,
      prevCursor: result.prevCursor,
      hasNext: result.nextCursor !== null,
      hasPrev: result.prevCursor !== null,
    };
  } catch (err) {
    auditLogger.error('Failed to search emails', {
      actor_id: userId,
      metadata: { error: (err as Error).message, folder: filter.folder },
    });
    throw new CruxError(
      'IMAP_SEARCH_FAILED',
      'Error al buscar correos en el servidor IMAP',
      { originalError: err as Error },
    );
  }
}

/**
 * OBTENER UN CORREO por UID.
 */
export async function getEmailByUID(
  userId: string,
  folder: string,
  uid: number,
): Promise<EmailDetail> {
  const user = await resolveUser(userId);
  const account = buildImapAccount(userId, user);

  try {
    const msg = await fetchEmailByUID(userId, account, folder, uid);
    if (!msg) {
      throw new CruxError(
        'MESSAGE_NOT_FOUND',
        'Correo no encontrado en la carpeta especificada',
        { details: { uid, folder } },
      );
    }
    return toDetail(msg);
  } catch (err) {
    if (err instanceof CruxError) throw err;
    auditLogger.error('Failed to fetch email by UID', {
      actor_id: userId,
      metadata: { error: (err as Error).message, uid, folder },
    });
    throw new CruxError(
      'IMAP_FETCH_FAILED',
      'Error al obtener el correo del servidor IMAP',
      { originalError: err as Error },
    );
  }
}

// ------------------------------------------------------------------
// Flag Operations
// ------------------------------------------------------------------

/**
 * MARCAR CARRITO como leído/no leído/favorito.
 */
export async function toggleEmailFlag(
  userId: string,
  req: MarkFlagRequest,
): Promise<{ uid: number; flag: string; status: string }> {
  const user = await resolveUser(userId);
  const account = buildImapAccount(userId, user);

  try {
    await markEmailFlag(userId, account, req.folder, req.uid, req.flag);

    auditLogger.info('Flag toggled', {
      actor_id: userId,
      metadata: { uid: req.uid, flag: req.flag, folder: req.folder },
    });

    return { uid: req.uid, flag: req.flag, status: 'updated' };
  } catch (err) {
    auditLogger.error('Failed to toggle flag', {
      actor_id: userId,
      metadata: { error: (err as Error).message, uid: req.uid },
    });
    throw new CruxError(
      'IMAP_FLAG_UPDATE_FAILED',
      'No se pudo actualizar el estado del correo',
      { originalError: err as Error },
    );
  }
}

// ------------------------------------------------------------------
// Move & Delete
// ------------------------------------------------------------------

/**
 * MOVER correo a otra carpeta.
 */
export async function moveUserEmail(
  userId: string,
  req: MoveEmailRequest,
): Promise<{ uid: number; status: string; to: string }> {
  const user = await resolveUser(userId);
  const account = buildImapAccount(userId, user);

  try {
    await moveEmail(userId, account, req.fromFolder, req.toFolder, req.uid);

    auditLogger.info('Email moved', {
      actor_id: userId,
      metadata: { uid: req.uid, from: req.fromFolder, to: req.toFolder },
    });

    return { uid: req.uid, status: 'moved', to: req.toFolder };
  } catch (err) {
    auditLogger.error('Failed to move email', {
      actor_id: userId,
      metadata: { error: (err as Error).message, uid: req.uid },
    });
    throw new CruxError(
      'IMAP_MOVE_FAILED',
      'No se pudo mover el correo a la carpeta destino',
      { originalError: err as Error },
    );
  }
}

/**
 * ELIMINAR correo permanentemente.
 */
export async function deleteUserEmail(
  userId: string,
  req: DeleteEmailRequest,
): Promise<{ uid: number; status: string }> {
  const user = await resolveUser(userId);
  const account = buildImapAccount(userId, user);

  try {
    await deleteEmail(userId, account, req.folder, req.uid);

    auditLogger.info('Email deleted', {
      actor_id: userId,
      metadata: { uid: req.uid, folder: req.folder },
    });

    return { uid: req.uid, status: 'deleted' };
  } catch (err) {
    auditLogger.error('Failed to delete email', {
      actor_id: userId,
      metadata: { error: (err as Error).message, uid: req.uid },
    });
    throw new CruxError(
      'IMAP_DELETE_FAILED',
      'No se pudo eliminar el correo',
      { originalError: err as Error },
    );
  }
}

// ------------------------------------------------------------------
// Send Email
// ------------------------------------------------------------------

/**
 * ENVIAR correo vía cola BullMQ (async).
 */
export async function queueEmailSend(
  userId: string,
  req: SendEmailRequest,
): Promise<SendEmailResponse> {
  const user = await resolveUser(userId);
  const smtpConfig = buildSmtpConfig(userId, user);

  const options: SendEmailOptions = {
    from: String(user.username),
    to: req.to,
    cc: req.cc,
    bcc: req.bcc,
    subject: req.subject,
    text: req.text,
    html: req.html,
  };

  try {
    const job = await addEmailSendJob(userId, smtpConfig, options);
    const jobId = (typeof job?.id === 'string') ? job.id : String(job?.id ?? '');

    auditLogger.info('Email queued for sending', {
      actor_id: userId,
      metadata: { job_id: jobId, to: req.to },
    });

    return { jobId, status: 'queued' };
  } catch (err) {
    auditLogger.error('Failed to queue email', {
      actor_id: userId,
      metadata: { error: (err as Error).message },
    });
    throw new CruxError(
      'SEND_QUEUE_FAILED',
      'No se pudo enqueuear el correo para envío',
      { originalError: err as Error },
    );
  }
}

// ------------------------------------------------------------------
// Sync
// ------------------------------------------------------------------

/**
 * ACTIVAR sincronización IMAP (cola BullMQ).
 */
export async function triggerSync(
  userId: string,
): Promise<{ jobId: string; status: string }> {
  await resolveUser(userId);

    try {
      const job = await addImapSyncJob(userId);
      return { jobId: String(job?.id ?? ''), status: 'syncing' };
  } catch (err) {
    auditLogger.error('Failed to trigger sync', {
      actor_id: userId,
      metadata: { error: (err as Error).message },
    });
    throw new CruxError(
      'SYNC_TRIGGER_FAILED',
      'No se pudo iniciar la sincronización',
      { originalError: err as Error },
    );
  }
}

/**
 * OBTENER ESTADO DE SINCRONIZACIÓN.
 */
export async function getSyncStatus(
  userId: string,
): Promise<{
  status: string;
  imapStatus: string;
  queueStats?: Record<string, unknown>;
}> {
  const imapStatus = getIMAPStatus(userId);

  let queueStats: Record<string, unknown> | undefined;
  try {
    queueStats = await getQueueStats('imap-sync');
  } catch {
    // Queue may not be initialized
  }

  return {
    status: imapStatus === 'connected' ? 'connected' : 'disconnected',
    imapStatus,
    queueStats,
  };
}

// ------------------------------------------------------------------
// Connection Management
// ------------------------------------------------------------------

/**
 * CERRAR conexión IMAP del usuario.
 */
export async function closeIMAPConnection(
  userId: string,
): Promise<{ status: string }> {
  await disconnectIMAP(userId);
  auditLogger.info('IMAP connection closed by user', { actor_id: userId });
  return { status: 'disconnected' };
}

// ------------------------------------------------------------------
// Bulk Operations
// ------------------------------------------------------------------

/**
 * OPERACIÓN MASIVA: marcar múltiples correos.
 */
export async function bulkMarkFlags(
  userId: string,
  req: BulkOperationRequest & { flag: 'SEEN' | 'UNSEEN' | 'FLAGGED' | 'UNFLAGGED' | 'DELETED' },
): Promise<{ processed: number; errors: string[] }> {
  const processed: number[] = [];
  const errors: string[] = [];

  for (const uid of req.uids) {
    try {
      await toggleEmailFlag(userId, { uid, folder: req.folder, flag: req.flag });
      processed.push(uid);
    } catch (err) {
      errors.push(`UID ${uid}: ${(err as Error).message}`);
    }
  }

  auditLogger.info('Bulk flag operation', {
    actor_id: userId,
    metadata: {
      total: req.uids.length,
      processed: processed.length,
      errors: errors.length,
    },
  });

  return { processed: processed.length, errors };
}

/**
 * OPERACIÓN MASIVA: mover múltiples correos.
 */
export async function bulkMoveEmails(
  userId: string,
  req: BulkOperationRequest & { toFolder: string },
): Promise<{ processed: number; errors: string[] }> {
  const processed: number[] = [];
  const errors: string[] = [];

  for (const uid of req.uids) {
    try {
      await moveUserEmail(userId, {
        uid,
        fromFolder: req.folder,
        toFolder: req.toFolder,
      });
      processed.push(uid);
    } catch (err) {
      errors.push(`UID ${uid}: ${(err as Error).message}`);
    }
  }

  auditLogger.info('Bulk move operation', {
    actor_id: userId,
    metadata: {
      total: req.uids.length,
      processed: processed.length,
      errors: errors.length,
    },
  });

  return { processed: processed.length, errors };
}