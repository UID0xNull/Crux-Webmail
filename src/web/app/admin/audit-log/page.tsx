'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { listAuditLogs, getAuditSummary, type AdminAuditLogParams } from 'lib/api/admin';
import type { AdminPaginatedAuditLogs, AdminAuditLogSummary, AdminAuditLogEntry } from 'lib/types';

const LEVELS = ['info', 'warn', 'error', 'critical'] as const;

// Updated to use CSS custom property tokens instead of hardcoded Tailwind classes for consistency
const LEVEL_STYLES: Record<string, string> = {
  info: 'bg-indigo-100 text-[var(--color-text-primary)] dark:bg-indigo-900/30',
  warn: 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/50',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30',
  critical: 'bg-red-200 text-[var(--color-text-primary)] dark:bg-red-900/50 font-bold',
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
      const logsPromise = listAuditLogs(params);
      const sum = summary ? Promise.resolve(summary) : getAuditSummary();
      const [logs, loadedSum] = await Promise.all([logsPromise, sum]);
      setData(logs);
      if (!summary) setSummary(loadedSum as AdminAuditLogSummary);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  function fmtTimestamp(ts: string): string {
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  }

  return (
    <main className="p-6 space-y-4 max-w-screen-xl mx-auto">
      <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-3">Audit Logs</h1>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard label="Total Events" value={String(summary.total)} />
          <SummaryCard label="Last 24h" value={String(summary.last24h)} accent="indigo" />
          <SummaryCard label="Critical" value={String(summary.criticalEvents)} accent="red" />
          <SummaryCard label="Errors" value={String(summary.byLevel?.error ?? '0')} accent="yellow" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search message…"
          value={params.search ?? ''}
          onChange={(e) => setParams((p) => ({ ...p, search: e.target.value || undefined, page: 1 }))}
          className="px-3 py-2 text-sm border rounded-lg bg-white min-w-[50%]"
        />
        <select
          value={params.level ?? ''}
          onChange={(e) => setParams((p) => ({ ...p, level: (e.target.value as any) || undefined, page: 1 }))}
          className="px-2 py-2 text-sm border rounded-lg bg-white"
        >
          <option value="">All Levels</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>

        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 text-sm bg-[var(--crux-accent-light)] text-white dark:text-black rounded-lg hover:bg-[#7DA4E0]"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Errors */}
      {error && (
        <p className="text-red-600">{error}</p>
      )}

      {/* Loading */}
      {loading && !data ? (
        <p>Loading logs…</p>
      ) : data?.logs ? (
        <>
          <div className="overflow-auto max-h-[50vh]">
            <table className="w-full text-sm border-collapse border rounded-lg">
              <thead className="sticky top-0 bg-white z-10">
                <tr>
                  {['Event', 'Level', 'Date', 'Actor'].map((h) => (
                    <th key={h} className="text-left py-2 px-4 border-b text-sm font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{renderAuditRows(data.results)}</tbody>
            </table>
          </div>

          <Pagination items={data.total || 0} pageSize={params.limit ?? 25} page={(params.page ?? 1)} onChange={(n) => setParams((p) => ({ ...p, page: n }))} />
        </>
      ) : (
        data?.results && data.results.length === 0 && <p className="text-gray-400">No logs</p>
      )}

      {/* Details Modal */}
      {expanded != null && expanded in detailEntries && detailEntries[expanded] && (
        <>
          <div onClick={() => setExpanded(null)} className="fixed inset-0 bg-black/60 z-40" />
          <DetailModal entry={detailEntries[expanded]} onClose={() => setExpanded(null)} />
        </>
      )}

      {/* Back link */}
      {!loading && (
        <a href="/admin" className="text-sm text-[var(--crux-accent-light)] hover:underline">← Admin</a>
      )}
    </main>
  );
}

const detailEntries = new Map<string, AdminAuditLogEntry>();
function renderAuditRows(items: AdminAuditLogEntry[]): React.ReactNode {
  return items.map((it) => (
    <tr key={it.id} className="cursor-pointer hover:bg-gray-100">
      <td className="py-2 px-4" title={String(it.action)}>{it.action}</td>
      <td className={`py-2 px-4`}>
        {LEVEL_STYLES[it.level] && (
          <span className={`px-3 py-[2px] rounded-full text-xs font-medium ${LEVEL_STYLES[it.level]}`}>
            {it.level.toUpperCase()}
          </span>
        )}
      </td>
      <td>{fmtTimestamp(it.timestamp)}</td>
      <td className="max-w-[10vw] overflow-hidden" title={String(it.actorName)}>{String(it.actorName)}</td>
    </tr>
  ));
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className={`text-xs text-[var(--color-text-secondary)] mb-1`}>{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function DetailModal({ entry, onClose }: { entry: AdminAuditLogEntry; onClose: () => void }) {
  React.useEffect(() => {
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escHandler);
    return () => document.removeEventListener('keydown', escHandler);
  }, [onClose]);
}

function Pagination({ items, pageSize, page, onChange }: { items: number; pageSize: number; page: number; onChange: (n: number) => void }) {
  const total = Math.max(1, Math.ceil(items / pageSize));
  return (
    <div className="flex gap-2">
      {Array.from({ length: total }, (_, i) => (
        <button key={i + 1} onClick={() => onChange(i + 1)} className={`px-3 py-1 text-sm border rounded-lg ${page === i + 1 ? 'bg-[var(--crux-accent-light)] text-white' : ''}`}>
          {i + 1}
        </button>
      ))}
    </div>
  );
}

