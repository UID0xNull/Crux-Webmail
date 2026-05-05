// ============================================================================
// Crux-Webmail Frontend — Shared Types
// ============================================================================

// ------------------------------------------------------------------
// Auth
// ------------------------------------------------------------------
export interface AuthToken {
  access_token: string;
  refresh_token: string;
  session_id: string;
  expires_in: number;
  correlation_id: string;
}

export interface LoginPayload {
  username: string;
  password: string;
  client_fingerprint: string;
  ip: string;
  cert_serial: string;
}

export interface UserProfile {
  user_id: string;
  email: string;
  display_name: string;
  roles: string[];
  mfa_enabled: boolean;
  last_login: string;
  sessions: ActiveSession[];
}

export interface ActiveSession {
  session_id: string;
  created_at: string;
  browser: string;
  ip: string;
  is_current: boolean;
}

// ------------------------------------------------------------------
// Mail / JMAP
// ------------------------------------------------------------------
export interface Mailbox {
  id: string;
  name: string;
  role: string;
  subscriptionEnabled: boolean;
  parentId?: string;
  childMailboxes?: string[];
  totalMessages?: number;
  unseenMessages?: number;
}

export interface EmailMessage {
  id: string;
  listIds: string[];
  mailboxId: string;
  subject: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  date: string;
  previewText: string;
  size: number;
  isSeen: boolean;
  isFlagged: boolean;
  isDraft: boolean;
  hasAttachments: boolean;
  headers?: Record<string, string>;
  bodyStructure?: BodyStructure;
  isEncrypted: boolean;
  isSigned: boolean;
  quarantine_status?: 'clean' | 'quarantined' | 'suspicious';
}

export interface EmailAddress {
  name: string;
  email: string;
}

export interface BodyStructure {
  type: string;
  subtype: string;
  params: Record<string, string>;
  description?: string;
  encoding: string;
  md5?: string;
  size: number;
  disposition?: string;
  language?: string[];
  location?: string;
  nestedParts?: BodyStructure[];
}

export interface EmailBodyPart {
  partId: string;
  content: string;
  type: string;
  subtype: string;
  encoding: string;
  filename?: string;
  size: number;
}

export interface ComposePayload {
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body_html: string;
  body_text: string;
  attachments?: AttachmentData[];
  encrypt?: boolean;
  sign?: boolean;
}

export interface AttachmentData {
  name: string;
  mimeType: string;
  data: string; // base64
  size: number;
}

// ------------------------------------------------------------------
// Crypto E2E
// ------------------------------------------------------------------
export interface E2EKeyPair {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
  created_at: string;
  expires_at: string;
}

export interface E2EEncryptedMessage {
  ciphertext: string; // base64
  iv: string;
  tag: string;
  sender_fingerprint: string;
  algorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305';
}

export interface PGPKeyInfo {
  keyID: string;
  creationDate: string;
  primaryKeyFingerprint: string;
  userIDs: { name?: string; email?: string }[];
  revocationSignatures: any[];
  signatures: any[];
}

// ------------------------------------------------------------------
// API Response
// ------------------------------------------------------------------
export interface ApiResponse<T> {
  data: T;
  status: number;
  correlation_id: string;
  timestamp: string;
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlation_id: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  queryId: string;
  newPosition: string | null;
  total?: number;
}

// ------------------------------------------------------------------
// Quarantine / Forensic
// ------------------------------------------------------------------
export interface QuarantineEntry {
  id: string;
  message_id: string;
  subject: string;
  from: string;
  received_at: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  malware_name?: string;
  quarantine_hash: string;
  status: 'quarantined' | 'released' | 'deleted';
  scan_report: ScanReport;
}

export interface ScanReport {
  clamav_result: string;
  spam_score: number;
  spam_rules_triggered: string[];
  dkim_valid: boolean;
  spf_result: 'pass' | 'fail' | 'softfail' | 'neutral';
  dmarc_result: 'pass' | 'fail';
  sandbox_verdict?: string;
  forensic_digest: string;
}

// ------------------------------------------------------------------
// Session / Fingerprint
// ------------------------------------------------------------------
export interface ClientFingerprint {
  browser: string;
  os: string;
  screen: string;
  timezone: string;
  languages: string[];
  hash: string;
}

export interface SessionState {
  isAuthenticated: boolean;
  token: string | null;
  refreshToken: string | null;
  sessionId: string | null;
  user: UserProfile | null;
  expiresAt: number;
  fingerprint: ClientFingerprint | null;
}
---CODE---