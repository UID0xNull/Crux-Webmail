// ============================================================================
// Crux-Webmail — Email Module: Centralized Exports
// ============================================================================
// Punto de entrada único para el módulo de email. Agrupa adaptadores
// (IMAP/SMTP), cola BullMQ, controller de negocio, types y utils.
// ============================================================================

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export {
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
  PaginationParams,
  BulkOperationRequest,
  AttachmentInfo,
} from './types';

// ------------------------------------------------------------------
// IMAP Adapter
// ------------------------------------------------------------------
export {
  listFolders,
  fetchEmails,
  fetchEmailByUID,
  searchEmailsWithPagination,
  markEmailFlag,
  deleteEmail,
  moveEmail,
  disconnectIMAP,
  getIMAPStatus,
  startIdleCleanup,
} from './imap-service';

export type { IMAPAccount, EmailMessage, ConnectionStatus } from './imap-service';

// ------------------------------------------------------------------
// SMTP Adapter
// ------------------------------------------------------------------
export {
  sendEmail,
  sendEncryptedEmail,
  sendTemplateEmail,
  closeAllTransporters,
} from './smtp-service';

export type { SendEmailOptions, SMTPConfig } from './smtp-service';

// ------------------------------------------------------------------
// BullMQ Queue
// ------------------------------------------------------------------
export {
  initQueues,
  closeQueues,
  addImapSyncJob,
  addEmailSendJob,
  addPgpJob,
  addClamavScanJob,
  addNotificationJob,
  getQueueStats,
} from './email-queue';

// ------------------------------------------------------------------
// Controller (Business Logic)
// ------------------------------------------------------------------
export {
  listUserFolders,
  searchEmails,
  getEmailByUID,
  toggleEmailFlag,
  moveUserEmail,
  deleteUserEmail,
  queueEmailSend,
  triggerSync,
  getSyncStatus,
  closeIMAPConnection,
  bulkMarkFlags,
  bulkMoveEmails,
} from './email.controller';