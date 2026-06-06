'use client';

import React, { useEffect, useState } from 'react';
import { getSystemHealth } from 'lib/api/admin';
import type { AdminSystemHealth } from 'lib/types';
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">{label}</span>
      <span className="font-semibold text-lg text-white dark:text-gray-100">{value}</span>
      {sub && <span className="mt-1 text-xs text-gray-400 dark:text-gray-500">{sub}</span>}
    </div>
  );
}

function ComponentStatusRow({ name, status }: { name: string; status?: string }) {
  if (!status) return null;
  const v = String(status).toLowerCase();
  let colorClass: string = 'text-slate-600 dark:text-gray-300';
  if (v === 'ok' || v === 'connected') colorClass = 'text-green-600 dark:text-green-400';
  else if (v.includes('error') || v.includes('fail')) colorClass = 'text-red-600 dark:text-red-400';

  let dotColor = 'bg-amber-500 dark:bg-gray-600';
  if (v === 'ok' || v === 'connected') dotColor = 'bg-green-500';
  else if (v.includes('error') || v.includes('fail')) dotColor = 'bg-red-500';

  return (
    <div className="flex items-center justify-between text-sm">
      <span>{name}</span>
      <span className={colorClass}>
        <span className={`inline-block w-2 h-2 rounded-full mr-1 ${dotColor}`} />
        {status}
      </span>
    </div>
  );
}

function Alert({ type, title, message }: { type: 'error' | 'success'; title?: string; message?: string }) {
  const cls = type === 'error'
    ? 'bg-red-50 border border-red-200 text-red-700 dark:text-red-300'
    : 'bg-green-50 border border-green-200 bg-opacity-50 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300';

  return (
    <div className={`rounded-lg p-3 ${cls}`}>
      {title && <p className="font-medium">{title}</p>}
      {message && <p className="mt-1 text-sm">{message}</p>}
    </div>
  );
}

export default function AdminHealthPage() {
  const [data, setData] = useState<AdminSystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await getSystemHealth();
      setData(d);
      setRefreshed(new Date());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load health data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function uptimeLabel(s: number) {
    const h = Math.floor(s / 3600);
    const d = Math.floor(h / 24);
    return d > 0 ? `${d}d ${h % 24}h` : h > 0 ? `${h}h ${Math.floor((s % 3600) / 60)}m` : `${s}s`;
  }

  const isErrorStatus = (s?: string) => {
    const v = String(s ?? '').toLowerCase();
    return v.includes('error') || v.includes('fail') || v.includes('down') || v === 'unknown';
  };
  const hasAnyError = !!data && (isErrorStatus(data.postgres.status) || isErrorStatus(data.redis.status));

  return (
    <main className="p-6 space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold mb-3 dark:text-white text-slate-900">System Health</h1>
          <p className="text-slate-500 mb-1 dark:text-gray-400">Server, database, cache, and queue status.</p>
          {refreshed && (          <span className="ml-2 text-xs text-slate-400 dark:text-gray-500">Last updated: {refreshed.toLocaleTimeString()}</span>)}
        </div>
        <button onClick={load} disabled={loading}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading && !data ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : error ? (
        <Alert type="error" message={error} />
      ) : data ? (
        <div className="space-y-4">
          {/* Server */}
          <Section title="Server">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-sm">
              <Metric label="Uptime" value={uptimeLabel(data.server.uptime)} />
              <Metric label="Memory"
                value={`${data.server.memory.percent.toFixed(1)}%`}
                sub={`${data.server.memory.usedMB.toFixed(0)} / ${data.server.memory.totalMB} MB`} />
              <Metric label="CPU" value={`${data.server.cpuPercent.toFixed(1)}%`} />
              <Metric label="Node" value={data.server.nodeVersion} />
              <Metric label="Environment" value={data.server.environment} />
            </div>
          </Section>

          {/* PostgreSQL */}
          <Section title="PostgreSQL">
            <ComponentStatusRow name="Connection" status={data.postgres.status ?? 'unknown'} />
            <span className="text-xs text-gray-500 mt-2">
              Latency: {data.postgres.latencyMs}ms{data.postgres.version ? ` • ${data.postgres.version}` : ''}
            </span>
          </Section>

          {/* Redis */}
          <Section title="Redis">
            <ComponentStatusRow name="Connection" status={data.redis.status ?? 'unknown'} />
            <span className="text-xs text-gray-500 mt-2">
              Latency: {data.redis.latencyMs}ms{typeof data.redis.connectedClients === 'number' ? ` • ${data.redis.connectedClients} clients` : ''}
            </span>
          </Section>

          {/* Queue */}
          <Section title="Email Queue">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <Metric label="Waiting" value={data.queues.email.waiting} />
              <Metric label="Active" value={data.queues.email.active} />
              <Metric label="Failed" value={data.queues.email.failed} />
            </div>
          </Section>

          {/* Errors */}
          {hasAnyError ? (
            <Alert type="error" title="Issues Found"
              message="One or more components are reporting errors. Check PostgreSQL and Redis connectivity." />
          ) : (
            <Alert type="success" title="System Status"
              message={data.server.uptime > 0 ? 'All systems operational' : 'System starting up'} />
          )}
        </div>
      ) : null}
    </main>
  );
}