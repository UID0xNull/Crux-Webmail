// ============================================================================
// Crux-Webmail — Shared Types
// ============================================================================
// Tipos compartidos entre server (Fastify) y web (Next.js).
// Ambos lados consumen estos tipos para validación de contratos API.
// ============================================================================

// ------------------------------------------------------------------
// JMAP Protocol Types
// ------------------------------------------------------------------
export interface JMAPMailMessage {
  id: string;
  subject: string;
  from: JMAPEmailAddress[];
  to: JMAPEmailAddress[];
  cc?: JMAPEmailAddress[];
  bcc?: JMAPEmailAddress[];
  date: string;
  preview: string;
  size: number;
  flags: string[];
  location: string;
  headers: Record<string, string[]>;
  bodyStructure: JMAPBodyStructure;
}

export interface JMAPEmailAddress {
  name: string;
  email: string;
}

export interface JMAPBodyStructure {
  type: 'message' | 'text' | 'multipart' | 'message/delivery-status';
  mimeType?: string;
  charset?: string;
  description?: string;
  language?: string[];
  location?: string;
  size?: number;
  parts?: JMAPBodyStructurePart[];
}

export interface JMAPBodyStructurePart extends JMAPBodyStructure {}

// ------------------------------------------------------------------
// Auth Types
// ------------------------------------------------------------------
export interface JWTPayload {
  sub: string;
  iss: string;
  aud: string;
  jti: string;
  iat: number;
  exp: number;
  fingerprint: string;
  scope: string[];
  mTLS_serial: string;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  error?: string;
  session_id?: string;
  fingerprint?: string;
}

export interface DeviceFingerprint {
  browser: string;
  os: string;
  screen: string;
  timezone: string;
  languages: string[];
  hash: string;
}

// ------------------------------------------------------------------
// Mail Types
// ------------------------------------------------------------------
export interface MailEnvelope {
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  date: string;
  flags: string[];
  size: number;
  uid: number;
}

export interface Mailbox {
  id: string;
  name: string;
  role?: 'inbox' | 'drafts' | 'sent' | 'trash' | 'spam' | 'archive';
  messages: number;
  unseen: number;
}

export interface SendMailRequest {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
}

export interface SendMailResult {
  accepted: string[];
  rejected: string[];
  envelopeId: string;
  dkimSigned: boolean;
  tlsUsed: boolean;
}

// ------------------------------------------------------------------
// API Types
// ------------------------------------------------------------------
export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlation_id: string;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: ApiError;
  correlation_id: string;
}

// ------------------------------------------------------------------
// Session Types
// ------------------------------------------------------------------
export interface SecureSession {
  id: string;
  userId: string;
  token: string;
  fingerprint: string;
  deviceInfo: DeviceFingerprint;
  created: number;
  expires: number;
  lastActive: number;
  mTLS_cert_serial: string;
  ip_hash: string;
  revoked: boolean;
}

export interface SecureContext {
  mtls_verified: boolean;
  session_id: string;
  user_id: string;
  fingerprint: string;
  ip_hash: string;
  audit_event_id: string;
}

// ------------------------------------------------------------------
// Audit Types
// ------------------------------------------------------------------
export interface AuditEvent {
  event_id: string;
  timestamp: string;
  source: string;
  level: 'info' | 'warn' | 'error' | 'critical';
  message: string;
  actor_id?: string;
  session_id?: string;
  client_ip?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
}

// ------------------------------------------------------------------
// Draft Types (Paso 6: Compositor de Correo)
// ------------------------------------------------------------------

/** Estados posibles de un draft */
export type DraftStatus = 'draft' | 'queued' | 'scanning' | 'ready' | 'error';

/** Estado de escaneo de un adjunto */
export type AttachmentScanStatus = 'pending' | 'scanning' | 'clean' | 'infected' | 'error';

/** Recipient type for compose */
export interface ComposeRecipient {
  name: string;
  email: string;
}

/** Payload del compositor */
export interface ComposePayload {
  to: ComposeRecipient[];
  cc?: ComposeRecipient[];
  bcc?: ComposeRecipient[];
  subject: string;
  body_html: string;
  body_text: string;
  encrypt: boolean;
  sign: boolean;
}

/** Draft persistente en BD */
export interface Draft {
  id: string;
  userId: string;
  to: ComposeRecipient[];
  cc?: ComposeRecipient[];
  bcc?: ComposeRecipient[];
  subject: string;
  body_html: string;
  body_text: string;
  status: DraftStatus;
  attachments: AttachmentMeta[];
  createdAt: string;
  updatedAt: string;
}

/** Metadatos de un adjunto */
export interface AttachmentMeta {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  sha256: string;
  scanStatus: AttachmentScanStatus;
  uploadUrl?: string;
  createdAt: string;
}

/** Respuesta de upload de adjunto */
export interface AttachmentUploadResult {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  scanStatus: AttachmentScanStatus;
  uploadUrl: string;
}

// ==========================================================================
// WebSocket Real-Time Types
// ==========================================================================

// ------------------------------------------------------------------
// Client → Server Events
// ------------------------------------------------------------------
export type WSClientEventType =
  | 'AUTH'
  | 'PING'
  | 'SUBSCRIBE'
  | 'UNSUBSCRIBE'
  | 'FLAG_UPDATE'
  | 'FOLDER_SYNC';

export interface WSClientMessage {
  type: WSClientEventType;
  id?: string;
  payload: Record<string, unknown>;
}

export interface WSAuthPayload {
  token: string;
  sessionId: string;
}

export interface WSSubscribePayload {
  channels: WSChannel[];
}

export interface WSFlagUpdatePayload {
  messageId: string;
  flags: string[];
  action: 'add' | 'remove';
}

// ------------------------------------------------------------------
// Server → Client Events
// ------------------------------------------------------------------
export type WSServerEventType =
  | 'READY'
  | 'ERROR'
  | 'PONG'
  | 'NEW_MESSAGE'
  | 'MESSAGE_FLAG_CHANGED'
  | 'MESSAGE_DELETED'
  | 'FOLDER_COUNTS_UPDATED'
  | 'SYNC_STATUS'
  | 'CONNECTION_WARNING'
  | 'DISCONNECTED';

export interface WSServerMessage {
  type: WSServerEventType;
  id?: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// ------------------------------------------------------------------
// Channels for selective subscription
// ------------------------------------------------------------------
export type WSChannel =
  | 'mail:new'
  | 'mail:flags'
  | 'mail:delete'
  | 'mail:folder-counts'
  | 'sync:status';

// ------------------------------------------------------------------
// Connection state
// ------------------------------------------------------------------
export type WSConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'authenticated'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface WSConnectionStatus {
  state: WSConnectionState;
  channels: WSChannel[];
  reconnectAttempts: number;
  lastPing: number | null;
  latency: number | null;
}

// ------------------------------------------------------------------
// Real-time event payloads
// ------------------------------------------------------------------
export interface NewMessageEvent {
  mailboxId: string;
  message: Partial<EmailMessage>;
}

export interface FlagChangedEvent {
  messageId: string;
  flags: string[];
  mailboxId: string;
}

export interface DeletedEvent {
  messageId: string;
  mailboxId: string;
}

export interface FolderCountsEvent {
  counts: Record<string, { total: number; unseen: number }>;
}

export interface SyncStatusEvent {
  status: 'idle' | 'syncing' | 'error';
  progress?: number;
  mailbox?: string;
}

// ------------------------------------------------------------------

export interface AmavisFilterResult {
  message_id: string;
  status: 'CLEAN' | 'INFECTED' | 'SPAM' | 'QUARANTINE' | 'ERROR';
  virus_detected?: string;
  spam_score?: number;
  spam_report?: string;
  action: 'PASS' | 'DUNNO' | 'BLOCK' | 'QUARANTINE';
  quarantine_id?: string;
  timestamp: number;
}