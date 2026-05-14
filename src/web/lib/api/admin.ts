// ============================================================================
// Crux-Webmail Frontend — Admin API Client
// ============================================================================

import { api } from './client';
import type {
  AdminDashboardData,
  AdminUserStats,
  AdminUserInfo,
  AdminPaginatedUsers,
  AdminAuditLogEntry,
  AdminPaginatedAuditLogs,
  AdminAuditLogSummary,
  AdminSystemHealth,
  AdminMailSystemStats,
  AdminSessionInfo,
  AdminAppSettings,
} from '@/lib/types';

// ------------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------------

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const resp = await api.get<{
    system: AdminSystemHealth;
    users: AdminUserStats;
    audits: AdminAuditLogSummary;
    recentActivity: Array<{ timestamp: string; type: string; description: string }>;
  }>('/api/admin/dashboard');
  return resp.data;
}

// ------------------------------------------------------------------
// Users
// ------------------------------------------------------------------

export interface AdminUserListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: 'user' | 'admin' | 'moderator';
  isActive?: boolean;
  mfaEnabled?: boolean;
  sort?: 'created_at' | 'last_login' | 'username';
  order?: 'asc' | 'desc';
}

export async function listAdminUsers(params: AdminUserListParams = {}): Promise<AdminPaginatedUsers> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.role) query.set('role', params.role);
  if (typeof params.isActive === 'boolean') query.set('isActive', String(params.isActive));
  if (typeof params.mfaEnabled === 'boolean') query.set('mfaEnabled', String(params.mfaEnabled));
  if (params.sort) query.set('sort', params.sort);
  if (params.order) query.set('order', params.order);

  const resp = await api.get<AdminPaginatedUsers>(`/api/admin/users?${query}`);
  return resp.data;
}

export async function getAdminUser(userId: string): Promise<AdminUserInfo> {
  const resp = await api.get<AdminUserInfo>(`/api/admin/users/${userId}`);
  return resp.data;
}

export async function createUserAdmin(
  username: string,
  password: string,
  display_name?: string,
  roles: string[] = ['user'],
): Promise<AdminUserInfo> {
  const resp = await api.post<AdminUserInfo>('/api/admin/users', {
    username,
    password,
    display_name,
    roles,
  });
  return resp.data;
}

export async function updateUserRole(userId: string, roles: string[]): Promise<AdminUserInfo> {
  const resp = await api.patch<AdminUserInfo>(`/api/admin/users/${userId}/roles`, { roles });
  return resp.data;
}

export async function toggleUserStatus(userId: string, isActive: boolean): Promise<AdminUserInfo> {
  const resp = await api.patch<AdminUserInfo>(`/api/admin/users/${userId}/status`, { isActive });
  return resp.data;
}

export async function unlockUserAdmin(userId: string): Promise<{ unlocked: boolean }> {
  const resp = await api.post<{ unlocked: boolean }>(`/api/admin/users/${userId}/unlock`, {});
  return resp.data;
}

export async function getUserStatsAdmin(): Promise<AdminUserStats> {
  const resp = await api.get<AdminUserStats>('/api/admin/users/stats');
  return resp.data;
}

// ------------------------------------------------------------------
// Audit Logs
// ------------------------------------------------------------------

export interface AdminAuditLogParams {
  page?: number;
  limit?: number;
  level?: 'info' | 'warn' | 'error' | 'critical';
  category?: string;
  actor_id?: string;
  from?: string;
  to?: string;
  search?: string;
}

export async function listAuditLogs(params: AdminAuditLogParams = {}): Promise<AdminPaginatedAuditLogs> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.level) query.set('level', params.level);
  if (params.category) query.set('category', params.category);
  if (params.actor_id) query.set('actor_id', params.actor_id);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.search) query.set('search', params.search);

  const resp = await api.get<AdminPaginatedAuditLogs>(`/api/admin/audit/logs?${query}`);
  return resp.data;
}

export async function getAuditSummary(): Promise<AdminAuditLogSummary> {
  const resp = await api.get<AdminAuditLogSummary>('/api/admin/audit/summary');
  return resp.data;
}

// ------------------------------------------------------------------
// System
// ------------------------------------------------------------------

export async function getSystemHealth(): Promise<AdminSystemHealth> {
  const resp = await api.get<AdminSystemHealth>('/api/admin/health');
  return resp.data;
}

export async function getMailSystemStats(): Promise<AdminMailSystemStats> {
  const resp = await api.get<AdminMailSystemStats>('/api/admin/mail-system');
  return resp.data;
}

export async function getAppSettings(): Promise<AdminAppSettings> {
  const resp = await api.get<AdminAppSettings>('/api/admin/settings');
  return resp.data;
}

// ------------------------------------------------------------------
// Sessions
// ------------------------------------------------------------------

export async function getActiveSessions(): Promise<{ sessions: AdminSessionInfo[]; total: number }> {
  const resp = await api.get<{ sessions: AdminSessionInfo[]; total: number }>('/api/admin/sessions');
  return resp.data;
}