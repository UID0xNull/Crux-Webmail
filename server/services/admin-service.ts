// ============================================================================
// Crux-Webmail — Admin Service Layer
// ============================================================================
// Business logic para operaciones administrativas: usuarios, salud del sistema,
// logs de auditoría, estadísticas de cola de correo, sesiones activas.
//
// IMPORTANTE: Este archivo NO debe importar directamente 'src' o 'app'.
// Todo debe ser relativo: 'models', 'models/auth/..'
// ============================================================================

import { UserModel } from 'models/User';
import { AuthTokenModel } from 'models/AuthToken';
import { AuditLogModel } from 'models/AuditLog';
import * as auth from 'models/auth/auth.models';
import * as redisClient from 'models/auth/redis/models';
import * as postgresService from 'models/auth/postgres/service';
import { getPostgresConnection } from 'models/database/connection';
import * as dotenv from 'dotenv';

dotenv.config();

// ------------------------------------------------------------------
// Tipos y Interfaces
// ------------------------------------------------------------------

export interface UserStats {
  total: number;
  active: number;
  locked: number;
  byRole: Record<'user' | 'admin' | 'moderator', number>;
}

export interface SystemHealth {
  uptime: string;
  memory: MemoryInfo;
  nodeVersion: string;
  postgres: PostgresStatus;
  redis: RedisStatus;
}

export interface PostgresStatus {
  status: 'healthy' | 'unhealthy' | 'unknown';
  latencyMs?: number;
}

export interface RedisStatus {
  status: 'connected' | 'disconnected';
  latencyMs?: number;
  connectedClients?: number;
}

export interface MemoryInfo {
  heapUsedPercent: number;
  totalMB: number;
  percent: number;
}

export interface MailSystemStats {
  postfix: { status: 'connected' | 'disconnected'; queue_size: number | null; host?: string };
  dovecot: { status: 'connected' | 'disconnected'; active_users: number; host?: string };
  amavis: { status: 'connected' | 'disconnected'; quarantine_count: number | null; host?: string };
  clamav: { status: 'connected' | 'disconnected'; host?: string };
  minio: { status: 'connected' | 'disconnected'; used_bytes: number | null; host?: string };
}

export interface AuditLogEntry {
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

export interface AuditLogSummary {
  total: number;
  byLevel: Record<'info' | 'warn' | 'error' | 'critical', number>;
  byCategory: Record<string, number>;
  last24h: number;
  criticalEvents: number;
}

export interface ActiveSessionInfo {
  session_id: string;
  user_id: string;
  username: string;
  fingerprint: string;
  created: string;
  lastActive: string;
  ip_hash: string;
}

export type RecentActivity = { events: Array<{ timestamp: string; type: string; description: string }> };

export interface AppSettings {
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

export interface CreateUserParams {
  username: string;
  display_name: string;
  roles?: ('user' | 'admin' | 'moderator')[];
}

// ------------------------------------------------------------------
// Configuración del entorno
// ------------------------------------------------------------------

const config = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  MAX_PASSWORD_LENGTH: parseInt(process.env.MAX_PASSWORD_LENGTH || '256', 10),
  MIN_PASSWORD_LENGTH: parseInt(process.env.MIN_PASSWORD_LENGTH || '8', 10),
  MAX_CONCURRENT_SESSIONS: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '3', 10),
  RATE_LIMIT_API_RPM: parseInt(process.env.RATE_LIMIT_API_RPM || '1500', 10),
  RATE_LIMIT_AUTH_RPM: parseInt(process.env.RATE_LIMIT_AUTH_RPM || '240', 10),
      POSTFIX_HOST: process.env.POSTFIX_HOST || 'postfix.example.com',
  POSTFIX_STATUS_CODE: parseInt(process.env.POSTFIX_STATUS_CODE || '50', 10),
  SESSION_TTL_MS: parseInt(process.env.SESSION_TTL_MS || '3600000', 10),
};