'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  listAdminUsers,
  createUserAdmin,
  updateUserRole,
  toggleUserStatus,
  unlockUserAdmin,
  type AdminUserListParams,
} from 'lib/api/admin';
import type { AdminUserInfo, AdminPaginatedUsers } from 'lib/types';

const ROLES = ['user', 'admin', 'moderator'] as const;

export default function AdminUsersPage() {
  const [data, setData] = useState<AdminPaginatedUsers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<AdminUserListParams>({ page: 1, limit: 20 });

  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', password: '', display_name: '', roles: 'user' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [editRoles, setEditRoles] = useState<{ userId: string; roles: string[] } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await listAdminUsers(params);
      setData(d);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  async function handleToggleStatus(user: AdminUserInfo) {
    setActionLoading(user.id);
    try {
      await toggleUserStatus(user.id, !user.is_active);
      await load();
    } catch (e: any) {
      alert(e?.message ?? 'Failed to update status');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnlock(user: AdminUserInfo) {
    setActionLoading(user.id);
    try {
      await unlockUserAdmin(user.id);
      await load();
    } catch (e: any) {
      alert(e?.message ?? 'Failed to unlock user');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRoleSave() {
    if (!editRoles) return;
    setActionLoading(editRoles.userId);
    try {
      await updateUserRole(editRoles.userId, editRoles.roles);
      setEditRoles(null);
      await load();
    } catch (e: any) {
      alert(e?.message ?? 'Failed to update roles');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    try {
      await createUserAdmin(
        createForm.username,
        createForm.password,
        createForm.display_name || undefined,
        [createForm.roles],
      );
      setCreating(false);
      setCreateForm({ username: '', password: '', display_name: '', roles: 'user' });
      await load();
    } catch (e: any) {
      setCreateError(e?.message ?? 'Failed to create user');
    } finally {
      setCreateLoading(false);
    }
  }

  function isLocked(user: AdminUserInfo): boolean {
    return !!user.locked_until && user.locked_until > Date.now();
  }

  return (
    <main className="p-6 space-y-4 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 mb-3">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage user accounts, roles, and status.</p>
        </div>
        <button
            onClick={() => setCreating(true)}
            className="px-3 py-1.5 text-white text-sm font-medium rounded-lg bg-[var(--crux-accent-main)] dark:bg-[var(--crux-accent-light)] hover:opacity-90 transition-colors"
          >
          + New User
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search username…"
          value={params.search ?? ''}
          onChange={(e) => setParams((p) => ({ ...p, search: e.target.value || undefined, page: 1 }))}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 w-48"
        />
        <select
          value={params.role ?? ''}
          onChange={(e) => setParams((p) => ({ ...p, role: (e.target.value as any) || undefined, page: 1 }))}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={params.isActive === undefined ? '' : String(params.isActive)}
          onChange={(e) => setParams((p) => ({ ...p, isActive: e.target.value === '' ? undefined : e.target.value === 'true', page: 1 }))}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        >
          <option value="">All status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <select
          value={params.sort ?? ''}
          onChange={(e) => setParams((p) => ({ ...p, sort: (e.target.value as any) || undefined }))}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        >
          <option value="">Sort: created</option>
          <option value="last_login">Sort: last login</option>
          <option value="username">Sort: username</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto bg-white dark:bg-gray-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Roles</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">MFA</th>
                  <th className="px-4 py-3 font-medium">Last Login</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data?.users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{u.username}</div>
                      {u.display_name && <div className="text-xs text-gray-500">{u.display_name}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span key={r} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            r === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                            r === 'moderator' ? 'text-[var(--color-text-primary)] bg-[var(--crux-accent-light)]' :
                            'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}>{r}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isLocked(u) ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Locked</span>
                      ) : u.is_active ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        u.mfa_enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'
                      }`}>{u.mfa_enabled ? 'On' : 'Off'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {u.last_login ? new Date(u.last_login).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          disabled={actionLoading === u.id}
                          onClick={() => setEditRoles({ userId: u.id, roles: [...u.roles] })}
                          className="text-xs text-[var(--crux-accent-main)] hover:underline disabled:opacity-50"
                        >
                          Roles
                        </button>
                    <button
                          disabled={actionLoading === u.id}
                          onClick={() => handleUnlock(u)}
                          className="text-xs text-[var(--crux-danger)] hover:underline disabled:opacity-50"
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        {isLocked(u) && (
                          <button
                            disabled={actionLoading === u.id}
                            onClick={() => handleUnlock(u)}
                            className="text-xs text-[var(--crux-danger)] hover:underline disabled:opacity-50"
                          >
                            Unlock
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data?.users.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center gap-3 text-sm">
              <button
                disabled={data.page <= 1}
                onClick={() => setParams((p) => ({ ...p, page: data.page - 1 }))}
                className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <span className="text-gray-500">Page {data.page} of {data.totalPages} — {data.total} users</span>
              <button
                disabled={data.page >= data.totalPages}
                onClick={() => setParams((p) => ({ ...p, page: data.page + 1 }))}
                className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Edit Roles Modal */}
      {editRoles && (
        <Modal title="Edit Roles" onClose={() => setEditRoles(null)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Select roles for this user:</p>
            <div className="flex flex-col gap-2">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editRoles.roles.includes(r)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEditRoles((prev) => prev ? { ...prev, roles: [...prev.roles, r] } : null);
                      } else {
                        setEditRoles((prev) => prev ? { ...prev, roles: prev.roles.filter((x) => x !== r) } : null);
                      }
                    }}
                    className="rounded"
                  />
                  <span className="capitalize">{r}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditRoles(null)} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button
                onClick={handleRoleSave}
                disabled={actionLoading === editRoles.userId || editRoles.roles.length === 0}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {actionLoading === editRoles.userId ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create User Modal */}
      {creating && (
        <Modal title="Create User" onClose={() => { setCreating(false); setCreateError(null); }}>
          <form onSubmit={handleCreate} className="space-y-3">
            {createError && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{createError}</div>}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Username *</label>
              <input
                required
                type="text"
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password *</label>
              <input
                required
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Display Name</label>
              <input
                type="text"
                value={createForm.display_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Role</label>
              <select
                value={createForm.roles}
                onChange={(e) => setCreateForm((f) => ({ ...f, roles: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setCreating(false); setCreateError(null); }} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button type="submit" disabled={createLoading} className="px-3 py-1.5 text-sm text-white rounded-lg bg-[var(--crux-accent-main)] dark:bg-[var(--crux-accent-light)] hover:opacity-90 disabled:opacity-50">
                {createLoading ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-sm mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}
