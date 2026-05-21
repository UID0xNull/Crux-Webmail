'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { listAuditLogs, getAuditSummary, type AdminAuditLogParams } from 'lib/api/admin';
import type { AdminPaginatedAuditLogs, AdminAuditLogSummary, AdminAuditLogEntry } from 'lib/types';

const LEVELS = ['info', 'warn', 'error', 'critical'] as const;

const LEVEL_STYLES: Record<string, string> = {
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  critical: 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300 font-bold',
};

export default function AdminAuditPage() {
  const [data, setData] = useState<AdminPaginatedAuditLogs | null>(null);
  const [summary, setSummary] = useState<AdminAuditLogSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<AdminAuditLogParams>({ page: 1, limit: 25 });
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logs, sum] = await Promise.all([
        listAuditLogs(params),
        summary ? Promise.resolve(summary) : getAuditSummary(),
      ]);
      setData(logs);
      if (!summary) setSummary(sum);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  function fmtTimestamp(ts: string) {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  }

  return (
    <main className="p-6 space-y-4 max-w-screen-xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Audit Logs</h1>
        <p className="text-sm text-gray-500 mt-0.5">Security and activity event history.</p>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Total Events" value={summary.total} />
          <SummaryCard label="Last 24h" value={summary.last24h} accent="blue" />
          <SummaryCard label="Critical" value={summary.criticalEvents} accent="red" />
          <SummaryCard label="Errors" value={summary.byLevel?.error ?? 0} accent="amber" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search message…"
          value={params.search ?? ''}
          onChange={(e) => setParams((p) => ({ ...p, search: e.target.value || undefined, page: 1 }))}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 w-52"
        />
        <select
          value={params.level ?? ''}
          onChange={(e) => setParams((p) => ({ ...p, level: (e.target.value as any) || undefined, page: 1 }))}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
        >
          <option value="">All levels</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <input
          type="text"
          placeholder="Category…"
          value={params.category ?? ''}
          onChange={(e) => setParams((p) => ({ ...p, category: e.target.value || undefined, page: 1 }))}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 w-36"
        />
        <input
          type="text"
          placeholder="Actor ID…"
          value={params.actor_id ?? ''}
          onChange={(e) => setParams((p) => ({ ...p, actor_id: e.target.value || undefined, page: 1 }))}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 w-36"
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">From</span>
          <input
            type="date"
            value={params.from ?? ''}
            onChange={(e) => setParams((p) => ({ ...p, from: e.target.value || undefined, page: 1 }))}
            className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">To</span>
          <input
            type="date"
            value={params.to ?? ''}
            onChange={(e) => setParams((p) => ({ ...p, to: e.target.value || undefined, page: 1 }))}
            className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
          />
        </div>
        <button
          onClick={() => { setParams({ page: 1, limit: 25 }); setSummary(null); }}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500"
        >
          Clear
        </button>
      </div>

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
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data?.logs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    >
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtTimestamp(log.timestamp)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${LEVEL_STYLES[log.level] ?? ''}`}>{log.level}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400">{log.category}</td>
                      <td className="px-4 py-2.5 text-xs max-w-xs truncate">{log.message}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{log.actor_id ? log.actor_id.slice(0, 8) + '…' : '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{log.client_ip ?? '—'}</td>
                    </tr>
                    {expanded === log.id && log.metadata && (
                      <tr className="bg-gray-50 dark:bg-gray-800/30">
                        <td colSpan={6} className="px-4 py-2">
                          <pre className="text-[11px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono overflow-auto max-h-48">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {data?.logs.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No logs found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center gap-3 text-sm">
              <button
                disabled={data.page <= 1}
                onClick={() => setParams((p) => ({ ...p, page: data.page - 1 }))}
                className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <span className="text-gray-500">Page {data.page} of {data.totalPages} — {data.total} events</span>
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
    </main>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: 'blue' | 'red' | 'amber' }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${
        accent === 'red' ? 'text-red-600' : accent === 'amber' ? 'text-amber-600' : accent === 'blue' ? 'text-blue-600' : 'text-gray-900 dark:text-gray-50'
      }`}>{value}</div>
    </div>
  );
}
