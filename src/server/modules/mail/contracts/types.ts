// ============================================================================
// Crux-Webmail — Mail Contracts: Tipos Normalizados
// ============================================================================
// Tipos de dominio que desacoplan lógica de negocio de protocolos.
// Cada entidad representa un concepto independiente del transporte.
// ============================================================================

// ------------------------------------------------------------------
// Flags IMAP — normalización de banderas
// ------------------------------------------------------------------
export interface IFlags {
  seen: boolean;
  answered: boolean;
  flagged: boolean;
  deleted: boolean;
  draft: boolean;
  recent: boolean;
  custom: string[];
}

// ------------------------------------------------------------------
// Dirección de correo normalizada
// ------------------------------------------------------------------
export interface IMailAddress {
  name: string;
  email: string;
}

// ------------------------------------------------------------------
// Mensaje de correo normalizado (protocol-agnostic)
// ------------------------------------------------------------------
export interface IMailMessage {
  uid: string;
  messageId: string;
  subject: string;
  from: IMailAddress[];
  to: IMailAddress[];
  cc: IMailAddress[];
  bcc: IMailAddress[];
  date: string;
  size: number;
  flags: IFlags;
  hasAttachments: boolean;
  preview: string;
  bodyText: string;
  bodyHtml: string;
  headers: Record<string, string[]>;
  attachmentCount: number;
}

// ------------------------------------------------------------------
// Attachment normalizado
// ------------------------------------------------------------------
export interface IAttachment {
  filename: string;
  mimeType: string;
  size: number;
  content: Buffer;
  contentId?: string;
  disposition: 'attachment' | 'inline';
}

// ------------------------------------------------------------------
// Buzón normalizado
// ------------------------------------------------------------------
export interface IMailbox {
  id: string;
  name: string;
  path: string;
  role: MailboxRole;
  messageCount: number;
  unseenCount: number;
  delimiter: string;
}

export type MailboxRole = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom';

// ------------------------------------------------------------------
// Resultados de operaciones normalizados
// ------------------------------------------------------------------
export interface ISearchResult {
  uids: string[];
  total: number;
}

export interface ISyncResponse {
  added: string[];
  modified: string[];
  removed: string[];
  state: string;
}

export interface ISendResult {
  envelopeId: string;
  messageId: string;
  accepted: string[];
  rejected: string[];
  dkimSigned: boolean;
  tlsUsed: boolean;
  timestamp: string;
}

export interface ICreateMessageInput {
  from: IMailAddress;
  to: IMailAddress[];
  cc?: IMailAddress[];
  bcc?: IMailAddress[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  replyTo?: IMailAddress;
  attachments?: Partial<IAttachment>[];
  headers?: Record<string, string>;
}

// ------------------------------------------------------------------
// Configuración de cuenta de correo
// ------------------------------------------------------------------
export interface IAccountConfig {
  accountId: string;
  userId: string;
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
  authType: 'PLAIN' | 'LOGIN' | 'XOAUTH2';
}

// ------------------------------------------------------------------
// Búsqueda
// ------------------------------------------------------------------
export interface ISearchQuery {
  mailbox?: string;
  since?: string;
  until?: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  flags?: Partial<IFlags>;
  hasAttachments?: boolean;
  sizeMin?: number;
  sizeMax?: number;
  limit?: number;
  offset?: number;
}

// ------------------------------------------------------------------
// Estado de conexión
// ------------------------------------------------------------------
export type ConnectionPhase = 'idle' | 'connecting' | 'authenticated' | 'mailbox-open' | 'error' | 'disconnected';

export interface IConnectionInfo {
  phase: ConnectionPhase;
  host: string;
  port: number;
  secure: boolean;
  connectedAt: string;
  lastActivity: string;
  capabilities?: string[];
}

// ------------------------------------------------------------------
// Opciones de fetch
// ------------------------------------------------------------------
export interface IFetchOptions {
  bodies: FetchBodyOption[];
  markSeen: boolean;
  uid: boolean;
}

export type FetchBodyOption = 'HEADER' | 'HEADER.FIELDS' | 'TEXT' | 'RFC822' | 'RFC822.HEADER' | string;