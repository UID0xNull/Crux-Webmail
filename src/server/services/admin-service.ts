// ============================================================================
// Crux-Webmail — Admin Service
// ============================================================================
// Business logic for admin operations: users, system health, audit logs,
// mail stats, queue monitoring, settings management.
// ============================================================================

import { UserModel } from 'models/User';
import { AuditLogModel } from 'models/AuditLog';
import { getRedis } from 'utils/connections';
import { config } from 'config/app.config';
import { Op } from 'sequelize';
import { auditLogger } from 'utils/audit-logger';
import { getQueueStats } from 'modules/email/email-queue';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface AdminUserStats {
  total: number;
  active: number;
  inactive: number;
  withMFA: number;
  locked: number;
  admins: number;
}

export interface AdminUserListParams {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  isActive?: boolean;
  mfaEnabled?: boolean;
  sort: string;
  order: string;
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

export interface AuditLogEntry {
  id: string;
  event_id: string;
  timestamp: string;
  source: string;
  level: string;
  category: string;
  message: string;
  actor_id: string | null;
  client_ip: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditLogParams {
  page: number;
  limit: number;
  level?: string;
  category?: string;
  actor_id?: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface AuditLogSummary {
  total: number;
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
  last24h: number;
  criticalEvents: number;
}

export interface SystemHealth {
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

export interface MailSystemStats {
  postfix: { status: string; queue_size: number | null; host: string };
  dovecot: { status: string; active_users: number | null; host: string };
  amavis: { status: string; quarantine_count: number | null; host: string };
  clamav: { status: string; host: string };
  minio: { status: string; used_bytes: number | null; host: string };
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

export interface RecentActivity {
  events: Array<{ timestamp: string; type: string; description: string }>;
}

// ------------------------------------------------------------------
// User Management
// ------------------------------------------------------------------

export async function getUserStats(): Promise<AdminUserStats> {
  const total = await UserModel.count({ paranoid: true });
  const active = await UserModel.count({
    where: { is_active: true },
    paranoid: true,
  });
  const withMFA = await UserModel.count({
    where: { mfa_enabled: true },
    paranoid: true,
  });
  const locked = await UserModel.count({
    where: {
      [Op.or]: [
        { locked_until: { [Op.gt]: Date.now() } },
        { failed_attempts: { [Op.gte]: 5 } },
      ],
    },
    paranoid: true,
  });
  const admins = await UserModel.count({
    where: {
      roles: { [Op.contains]: ['admin'] },
    },
    paranoid: true,
  });

  return { total, active, inactive: total - active, withMFA, locked, admins };
}

export async function listUsers(
  params: AdminUserListParams,
): Promise<{ users: AdminUserInfo[]; total: number; page: number; totalPages: number }> {
  const {
    page = 1,
    limit = 25,
    search,
    role,
    isActive,
    mfaEnabled,
    sort = 'created_at',
    order = 'desc',
  } = params;

  const where: Record<string, unknown> = {};

  if (search) {
    (where as any)[Op.or] = [
      { username: { [Op.iLike]: `%${search}%` } },
      { display_name: { [Op.iLike]: `%${search}%` } },
    ];
  }
  if (role) {
    (where as any)['roles'] = { [Op.contains]: [role] };
  }
  if (typeof isActive === 'boolean') {
    where['is_active'] = isActive;
  }
  if (typeof mfaEnabled === 'boolean') {
    where['mfa_enabled'] = mfaEnabled;
  }

  const { count, rows } = await UserModel.findAndCountAll({
    where,
    paranoid: true,
    limit,
    offset: (page - 1) * limit,
    order: [[sort, order]],
    attributes: ['id', 'username', 'display_name', 'roles', 'is_active', 'mfa_enabled', 'failed_attempts', 'locked_until', 'last_login', 'created_at'],
  });

  const users: AdminUserInfo[] = rows.map((u: any) => ({
    id: u.id,
    username: u.username,
    display_name: u.display_name ?? null,
    roles: u.roles || [],
    is_active: u.is_active ?? true,
    mfa_enabled: u.mfa_enabled ?? false,
    failed_attempts: u.failed_attempts ?? 0,
    locked_until: u.locked_until ?? null,
    last_login: u.last_login ?? null,
    created_at: u.created_at ?? new Date().toISOString(),
  }));

  return { users, total: count, page, totalPages: Math.ceil(count / limit) };
}

export async function getUserDetail(userId: string): Promise<AdminUserInfo | null> {
  const user = await UserModel.findByPk(userId, {
    paranoid: true,
    attributes: ['id', 'username', 'display_name', 'roles', 'is_active', 'mfa_enabled', 'failed_attempts', 'locked_until', 'last_login', 'created_at'],
  });
  if (!user) return null;
  const u = user as any;
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name ?? null,
    roles: u.roles || [],
    is_active: u.is_active ?? true,
    mfa_enabled: u.mfa_enabled ?? false,
    failed_attempts: u.failed_attempts ?? 0,
    locked_until: u.locked_until ?? null,
    last_login: u.last_login ?? null,
    created_at: u.created_at ?? new Date().toISOString(),
  };
}

export async function updateUserRole(userId: string, roles: string[]): Promise<AdminUserInfo | null> {
  const validRoles = ['user', 'admin', 'moderator'];
  if (!roles.every((r) => validRoles.includes(r))) {
    throw new Error('Invalid role. Allowed: user, admin, moderator');
  }
  const user = await UserModel.findByPk(userId);
  if (!user) return null;
  await user.update({ roles });
  auditLogger.info('User roles updated', { actor_id: userId, metadata: { roles } });
  return getUserDetail(userId);
}

export async function toggleUserStatus(userId: string, isActive: boolean): Promise<AdminUserInfo | null> {
  const user = await UserModel.findByPk(userId);
  if (!user) return null;
  await user.update({ is_active: isActive });
  auditLogger.info(`User ${isActive ? 'activated' : 'deactivated'}`, { actor_id: userId });
  return getUserDetail(userId);
}

export async function unlockUser(userId: string): Promise<boolean> {
  const user = await UserModel.findByPk(userId);
  if (!user) return false;
  await user.update({ failed_attempts: 0, locked_until: undefined as any });
  auditLogger.info('User unlocked', { actor_id: userId });
  return true;
}

export async function createUserUser(username: string, password: string, displayName?: string, roles: string[] = ['user']): Promise<AdminUserInfo | null> {
  const validRoles = ['user', 'admin', 'moderator'];
  if (!roles.every((r) => validRoles.includes(r))) {
    throw new Error('Invalid role');
  }
  const existing = await UserModel.findOne({ where: { username } });
  if (existing) throw new Error('Username already exists');
  const user = await UserModel.create({ username, password, display_name: displayName || null, roles, is_active: true });
  return getUserDetail(user.id);
}

// ------------------------------------------------------------------
// System Health
// ------------------------------------------------------------------

export async function getSystemHealth(): Promise<SystemHealth> {
  const mem = process.memoryUsage();

  let pgStatus = 'unknown';
  let pgLatency = 0;
  try {
    const start = Date.now();
    const db = (global as any).__sequelize;
    if (db) {
      await db.query('SELECT 1');
      pgStatus = 'connected';
      pgLatency = Date.now() - start;
    }
  } catch {
    pgStatus = 'disconnected';
  }

  let redisStatus = 'unknown';
  let redisLatency = 0;
  let redisClients = 0;
  try {
    const start = Date.now();
    const redis = await getRedis();
    await redis.ping();
    redisStatus = 'connected';
    redisLatency = Date.now() - start;
    const info = await redis.info('clients');
    const match = info.match(/connected_clients:(\d+)/);
    if (match) redisClients = parseInt(match[1], 10);
  } catch {
    redisStatus = 'disconnected';
  }

  let queueStats = { waiting: 0, active: 0, failed: 0 };
  try {
    const stats = await getQueueStats('email-send');
    queueStats = { waiting: stats.waiting, active: stats.active, failed: stats.failed };
  } catch {
    // queues not initialized
  }

  return {
    server: {
      uptime: process.uptime(),
      memory: {
        usedMB: Math.round(mem.heapUsed / 1024 / 1024),
        totalMB: Math.round(mem.heapTotal / 1024 / 1024),
        percent: Math.round((mem.heapUsed / mem.heapTotal) * 100),
      },
      cpuPercent: 0,
      nodeVersion: process.version,
      environment: config.NODE_ENV,
    },
    postgres: { status: pgStatus, latencyMs: pgLatency },
    redis: { status: redisStatus, latencyMs: redisLatency, connectedClients: redisClients },
    queues: { email: queueStats },
  };
}

// ------------------------------------------------------------------
// Audit Logs
// ------------------------------------------------------------------

export async function getAuditLogs(
  params: AuditLogParams,
): Promise<{ logs: AuditLogEntry[]; total: number; page: number; totalPages: number }> {
  const { page = 1, limit = 50, level, category, actor_id, from, to, search } = params;

  const where: Record<string, unknown> = {};

  if (level) where.level = level;
  if (category) where.category = category;
  if (actor_id) where.actor_id = actor_id;

  if (from || to) {
    const tsWhere: Record<string, unknown> = {};
    if (from) (tsWhere as any)[Op.gte] = new Date(from);
    if (to) (tsWhere as any)[Op.lte] = new Date(to);
    (where as any)['timestamp'] = tsWhere;
  }

  if (search) {
    (where as any)[Op.or] = [
      { message: { [Op.iLike]: `%${search}%` } },
      { source: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { count, rows } = await AuditLogModel.findAndCountAll({
    where,
    limit,
    offset: (page - 1) * limit,
    order: [['timestamp', 'DESC']],
  });

  const logs: AuditLogEntry[] = rows.map((log: any) => ({
    id: log.id,
    event_id: log.event_id ?? '',
    timestamp: log.timestamp ?? new Date().toISOString(),
    source: log.source ?? 'unknown',
    level: log.level ?? 'info',
    category: log.category ?? 'system',
    message: log.message ?? '',
    actor_id: log.actor_id ?? null,
    client_ip: log.client_ip ?? null,
    metadata: log.metadata ?? null,
  }));

  return { logs, total: count, page, totalPages: Math.ceil(count / limit) };
}

export async function getAuditLogSummary(): Promise<AuditLogSummary> {
  const total = await AuditLogModel.count();

  const levelRows = await AuditLogModel.findAll({
    attributes: ['level', [AuditLogModel.sequelize!.fn('COUNT', '*'), 'count']],
    group: ['level'],
    raw: true,
  });
  const byLevel: Record<string, number> = {};
  for (const row of levelRows as any[]) {
    byLevel[row.level] = parseInt(row.count, 10);
  }

  const categoryRows = await AuditLogModel.findAll({
    attributes: ['category', [AuditLogModel.sequelize!.fn('COUNT', '*'), 'count']],
    group: ['category'],
    raw: true,
  });
  const byCategory: Record<string, number> = {};
  for (const row of categoryRows as any[]) {
    byCategory[row.category] = parseInt(row.count, 10);
  }

  const last24h = await AuditLogModel.count({
    where: { timestamp: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });

  const criticalEvents = await AuditLogModel.count({ where: { level: 'critical' } });

  return { total, byLevel, byCategory, last24h, criticalEvents };
}

// ------------------------------------------------------------------
// Mail System Stats
// ------------------------------------------------------------------

export async function getMailSystemStats(): Promise<MailSystemStats> {
  const checkHost = async (host: string, port: number): Promise<boolean> => {
    try {
      const net = require('net');
      return new Promise((resolve) => {
        const socket = net.createConnection({ host, port }, () => {
          socket.destroy();
          resolve(true);
        }).on('error', () => resolve(false));
        setTimeout(() => { socket.destroy(); resolve(false); }, 3000);
      });
    } catch {
      return false;
    }
  };

  const [postfixOk, dovecotOk, amavisOk, clamavOk, minioOk] = await Promise.all([
    checkHost(config.POSTFIX_HOST, config.POSTFIX_PORT),
    checkHost(config.DOVECOT_HOST, config.DOVECOT_PORT),
    checkHost(config.AMAVIS_HOST, config.AMAVIS_PORT),
    checkHost(config.CLAMAV_HOST, config.CLAMAV_PORT),
    checkHost(config.MINIO_HOST, config.MINIO_PORT),
  ]);

  const activeUsers = await UserModel.count({ where: { is_active: true } });

  return {
    postfix: { status: postfixOk ? 'connected' : 'disconnected', queue_size: null, host: config.POSTFIX_HOST },
    dovecot: { status: dovecotOk ? 'connected' : 'disconnected', active_users: activeUsers, host: config.DOVECOT_HOST },
    amavis: { status: amavisOk ? 'connected' : 'disconnected', quarantine_count: null, host: config.AMAVIS_HOST },
    clamav: { status: clamavOk ? 'connected' : 'disconnected', host: config.CLAMAV_HOST },
    minio: { status: minioOk ? 'connected' : 'disconnected', used_bytes: null, host: config.MINIO_HOST },
  };
}

// ------------------------------------------------------------------
// Active Sessions
// ------------------------------------------------------------------

export async function getActiveSessions(): Promise<ActiveSessionInfo[]> {
  try {
    const redis = await getRedis();
    const keys = await redis.keys('session:*');
    const sessions: ActiveSessionInfo[] = [];

    for (const key of keys.slice(0, 500)) {
      const data = await redis.get(key);
      if (!data) continue;
      try {
        const session: any = JSON.parse(data);
        const user = await UserModel.findOne({
          where: { id: session.userId },
          attributes: ['username'],
          paranoid: true,
        });
        sessions.push({
          session_id: session.id || key.replace('session:', ''),
          user_id: session.userId,
          username: user?.username || 'unknown',
          fingerprint: session.fingerprint,
          created: new Date(session.created).toISOString(),
          lastActive: new Date(session.lastActive).toISOString(),
          ip_hash: session.ip_hash,
        });
      } catch {
        // skip unparseable sessions
      }
    }

    return sessions.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------
// App Settings
// ------------------------------------------------------------------

export function getAppSettings(): AppSettings {
  return {
    app_name: 'Crux-Webmail',
    app_version: '1.0.0',
    environment: config.NODE_ENV,
    maintenance_mode: false,
    registration_open: true,
    max_password_length: 256,
    min_password_length: config.MIN_PASSWORD_LENGTH,
    max_concurrent_sessions: config.MAX_CONCURRENT_SESSIONS,
    rate_limit_api_rpm: config.RATE_LIMIT_API_RPM,
    rate_limit_auth_rpm: config.RATE_LIMIT_AUTH_RPM,
    mfa_required: false,
    session_ttl_ms: config.JWT_REFRESH_TTL_MS,
  };
}

// ------------------------------------------------------------------
// Recent Activity
// ------------------------------------------------------------------

export async function getRecentActivity(limit: number = 20): Promise<RecentActivity> {
  const recent = await AuditLogModel.findAll({
    limit,
    order: [['timestamp', 'DESC']],
    attributes: ['timestamp', 'category', 'message', 'level'],
  });

  return {
    events: recent.map((log: any) => ({
      timestamp: log.timestamp ?? new Date().toISOString(),
      type: `${log.category ?? 'system'}:${log.level ?? 'info'}`,
      description: log.message ?? '',
    })),
  };
}