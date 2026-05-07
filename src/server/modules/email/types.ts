// ============================================================================
// Crux-Webmail — Email Module Types
// ============================================================================
// Interfaces de entrada/salida para controladores de correo.
// Define contratos de paginación, búsqueda, bandejas y operaciones IMAP.
// ============================================================================

// ------------------------------------------------------------------
// Pagination
// ------------------------------------------------------------------
export interface PaginationParams {
  limit?: number;
  page?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  nextCursor: string | null;
  prevCursor: string | null;
  hasNext: boolean;
  hasPrev: boolean;
}

// ------------------------------------------------------------------
// Email Search
// ------------------------------------------------------------------
export interface EmailSearchFilter {
  folder?: string;
  since?: string;
  until?: string;
  from?: string;
  to?: string;
  subject?: string;
  unread?: boolean;
  flagged?: boolean;
  hasAttachments?: boolean;
}

// ------------------------------------------------------------------
// Email Operations
// ------------------------------------------------------------------
export interface MarkFlagRequest {
  uid: number;
  folder: string;
  flag: 'SEEN' | 'UNSEEN' | 'FLAGGED' | 'UNFLAGGED' | 'DELETED';
}

export interface MoveEmailRequest {
  uid: number;
  fromFolder: string;
  toFolder: string;
}

export interface DeleteEmailRequest {
  uid: number;
  folder: string;
}

export interface BulkOperationRequest {
  uids: number[];
  folder: string;
}

// ------------------------------------------------------------------
// Send Email
// ------------------------------------------------------------------
export interface SendEmailRequest {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
}

export interface SendEmailResponse {
  jobId: string;
  status: 'queued' | 'sent';
  messageId?: string;
}

// ------------------------------------------------------------------
// Folder / Mailbox
// ------------------------------------------------------------------
export interface FolderInfo {
  name: string;
  delimiter: string;
  flags: string[];
  specialUse?: string;
  messages?: number;
  unseen?: number;
}

// ------------------------------------------------------------------
// Attachment (stub for Paso 6)
// ------------------------------------------------------------------
export interface AttachmentInfo {
  filename: string;
  contentType: string;
  size: number;
  cid?: string;
  downloadUrl?: string;
}

// ------------------------------------------------------------------
// Email Envelope (list view — sin cuerpo completo)
// ------------------------------------------------------------------
export interface EmailEnvelope {
  uid: number;
  subject: string;
  from: { address: string; name?: string }[];
  to: { address: string; name?: string }[];
  date: string;
  flags: string[];
  hasAttachments: boolean;
  snippet?: string;
  size?: number;
}

// ------------------------------------------------------------------
// Email Detail (full view — con cuerpo)
// ------------------------------------------------------------------
export interface EmailDetail extends EmailEnvelope {
  text: string;
  html: string;
  cc: { address: string; name?: string }[];
  headers?: Record<string, string>;
  bodyStructure?: string;
  attachments?: AttachmentInfo[];
}