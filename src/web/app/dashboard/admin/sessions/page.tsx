'use client';

import React, { useEffect, useState } from 'react';
import { getActiveSessions } from 'lib/api/admin';
import type { AdminSessionInfo } from 'lib/types';

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<AdminSessionInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await getActiveSessions();
      setSessions(d.sessions);
      setTotal(d.total);
      setRefreshed(new Date());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function fmtDate(s: string) {
    try { return new Date(s).toLocaleString(); } catch { return s; }
  }

  function relativeTime(s: string) {
    try {
      const diff = Date.now() - new Date(s).getTime();
      const m = Math.floor(diff / 60_000);
      if (m < 1) return 'just now';
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.floor(h / 24)}d ago`;
    } catch {
      return s;
    }
  }

  return (
    <main className="p-6 space-y-4 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Active Sessions</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} active session{total !== 1 ? 's' : ''} across all users.
            {refreshed && <span className="ml-2">Last updated: {refreshed.toLocaleTimeString()}</span>}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-x-auto bg-white dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Session ID</th>
                <th className="px-4 py-3 font-medium">Fingerprint</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Last Active</th>
                <th className="px-4 py-3 font-medium">IP Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sessions.map((s) => (
                <tr key={s.session_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{s.username}</div>
                    <div className="text-[10px] font-mono text-gray-400">{s.user_id.slice(0, 12)}…</div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">{s.session_id.slice(0, 16)}…</td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500 max-w-[120px] truncate">{s.fingerprint}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(s.created)}</td>
                  <td className="px-4 py-3 text-xs">
                    <span title={fmtDate(s.lastActive)} className="text-gray-600 dark:text-gray-400">{relativeTime(s.lastActive)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-400">{s.ip_hash.slice(0, 12)}…</td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No active sessions.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
