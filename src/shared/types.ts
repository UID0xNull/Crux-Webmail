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
// Filter Types (Amavis/ClamAV)
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