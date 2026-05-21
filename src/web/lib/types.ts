// ============================================================================
// Crux-Webmail Frontend — Shared Types
// ============================================================================
// Definiciones centralizadas para el frontend. Se alinea con src/shared/types.ts
// para consistencia del contrato API bidireccional.
// ============================================================================

// ------------------------------------------------------------------
// Auth
// ------------------------------------------------------------------
export interface AuthToken {
  access_token: string;
  refresh_token: string;
  session_id: string;
  expires_in: number;
}

export interface LoginPayload {
  username: string;
  password: string;
  device_fingerprint: {
    browser: string;
    os: string;
    screen: string;
    timezone: string;
    languages: string[];
  };
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
// Session / Fingerprint
// ------------------------------------------------------------------
export interface ClientFingerprint {
  browser: string;
  os: string;
  screen: string;
  timezone: string;
  languages: readonly string[];
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

// ------------------------------------------------------------------
// API Response (unificado — se importa desde shared para el contrato)
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

export interface PaginatedResponse<T> {
  items: T[];
  queryId: string;
  newPosition: string | null;
  total?: number;
}

// ------------------------------------------------------------------
// Mail / JMAP
// ------------------------------------------------------------------
export interface Mailbox {
  id: string;
  name: string;
  role?: string;
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

export interface AttachmentData {
  name: string;
  mimeType: string;
  data: string; // base64
  size: number;
}

// ------------------------------------------------------------------
// Compose
// ------------------------------------------------------------------
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
// Admin Panel Types
// ------------------------------------------------------------------

export interface AdminUserStats {
  total: number;
  active: number;
  inactive: number;
  withMFA: number;
  locked: number;
  admins: number;
}

export interface AdminUserInfo {
  id: string;
  username: string;
  display_name: string | null;
  roles: string[];
  is_active: boolean;
  mfa_enabled: boolean;
  failed_attempts: number;
  locked_until: number | null;
  last_login: string | null;
  created_at: string;
}

export interface AdminAuditLogEntry {
  id: string;
  event_id: string;
  timestamp: string;
  source: string;
  level: 'info' | 'warn' | 'error' | 'critical';
  category: string;
  message: string;
  actor_id: string | null;
  client_ip: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AdminAuditLogSummary {
  total: number;
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
  last24h: number;
  criticalEvents: number;
}

export interface AdminSystemHealth {
  server: {
    uptime: number;
    memory: { usedMB: number; totalMB: number; percent: number };
    cpuPercent: number;
    nodeVersion: string;
    environment: string;
  };
  postgres: { status: string; latencyMs: number; version?: string };
  redis: { status: string; latencyMs: number; connectedClients?: number };
  queues: { email: { waiting: number; active: number; failed: number } };
}

export interface AdminMailSystemStats {
  postfix: { status: string; queue_size: number | null; host: string };
  dovecot: { status: string; active_users: number | null; host: string };
  amavis: { status: string; quarantine_count: number | null; host: string };
  clamav: { status: string; host: string };
  minio: { status: string; used_bytes: number | null; host: string };
}

export interface AdminSessionInfo {
  session_id: string;
  user_id: string;
  username: string;
  fingerprint: string;
  created: string;
  lastActive: string;
  ip_hash: string;
}

export interface AdminAppSettings {
  app_name: string;
  app_version: string;
  environment: string;
  maintenance_mode: boolean;
  registration_open: boolean;
  max_password_length: number;
  min_password_length: number;
  max_concurrent_sessions: number;
  rate_limit_api_rpm: number;
  rate_limit_auth_rpm: number;
  mfa_required: boolean;
  session_ttl_ms: number;
}

export interface AdminDashboardData {
  system: AdminSystemHealth;
  users: AdminUserStats;
  audits: AdminAuditLogSummary;
  recentActivity: Array<{ timestamp: string; type: string; description: string }>;
}

export interface AdminPaginatedUsers {
  users: AdminUserInfo[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AdminPaginatedAuditLogs {
  logs: AdminAuditLogEntry[];
  total: number;
  page: number;
  totalPages: number;
}

// ------------------------------------------------------------------
// WebSocket Types (re-export para convenience)
// ------------------------------------------------------------------
export type WSConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'authenticated'
  | 'connected'
  | 'reconnecting'
  | 'error';