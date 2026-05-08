// ============================================================================
// Crux-Webmail Backend Core — Tipos Globales
// ============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';

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

export interface JMAPRequest {
  method: string;
  args: Record<string, unknown>[];
  id?: string;
  session?: string;
}

export interface JMAPResponse {
  timestamp: string;
  accountId: string;
  methodCalls: JMAPMethodResult[];
  notifications?: JMAPNotification[];
  accountData?: AccountData[];
  session: SessionData;
  pivotURIs?: Record<string, string>;
}

export interface JMAPMethodResult {
  id: string;
  method: string;
  accountId: string;
  result: Record<string, unknown>;
}

export interface JMAPNotification {
  accountId: string;
  type: string;
  method: string;
  id: string;
  properties: string[];
  state: string;
  changedSince?: string;
  updated?: string[];
  destroyed?: string[];
}

export interface AccountData {
  primaryId: string;
  id: string;
  name: string;
  email: string;
  authenticationType: string;
  url?: string;
  roles?: string[];
}

export interface SessionData {
  accountId: string;
  maxSize: number;
  maxSessionLifetime: number;
  maxUploadSize: number;
  url: string;
  userID: string;
  userAgent?: string;
  state: string;
  mailboxes: Record<string, string>;
  pushEndpoints?: string[];
}

// ------------------------------------------------------------------
// Session & Auth Types
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

export interface DeviceFingerprint {
  browser: string;
  os: string;
  screen: string;
  timezone: string;
  languages: string[];
  hash: string;
}

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

// ------------------------------------------------------------------
// Bridge Types
// ------------------------------------------------------------------
export interface ImapBridgeConfig {
  host: string;
  port: number;
  secure: boolean;
  tls: {
    cert: string;
    key: string;
    ca: string;
    rejectUnauthorized: boolean;
    minVersion: string;
  };
  auth: {
    type: 'PLAIN' | 'LOGIN' | 'XOAUTH2';
    username: string;
    password: string;
  };
  connectionTimeout: number;
  greetingTimeout: number;
  maxRetries: number;
  backoffMultiplier: number;
  maxConnections: number;
}

export interface DovecotMailboxInfo {
  path: string;
  specialUse: string[];
  messages: number;
  unseen: number;
  name: string;
}

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

export interface SmtpRelayResult {
  accepted: string[];
  rejected: string[];
  envelopeId: string;
  dkimSigned: boolean;
  tlsUsed: boolean;
}

export interface BridgeHealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency_ms: number;
  last_check: number;
  connections: number;
  error_rate: number;
}

// ------------------------------------------------------------------
// Rate Limiting Types
// ------------------------------------------------------------------
export interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyGenerator: (req: FastifyRequest) => string;
  statusCode: number;
  message: string;
  skip?: (req: FastifyRequest) => boolean;
}

// ------------------------------------------------------------------
// Filter Types (para integración Amavis)
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

// ------------------------------------------------------------------
// Audit & Logging Types
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
  error?: string;
  reason?: string;
  environment?: string;
  port?: number;
  stack?: string;
  fatal?: boolean;
}

// ------------------------------------------------------------------
// API Error Types
// ------------------------------------------------------------------
export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlation_id: string;
}

export interface SecureContext {
  mtls_verified: boolean;
  session_id: string;
  user_id: string;
  fingerprint: string;
  ip_hash: string;
  audit_event_id: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    secureContext?: SecureContext;
    auditEvent?: Partial<AuditEvent>;
  }
}