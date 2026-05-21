'use client';

import React, { useEffect, useState } from 'react';
import { getSystemHealth } from 'lib/api/admin';
import type { AdminSystemHealth } from 'lib/types';

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

  function statusColor(s: string) {
    const v = String(s).toLowerCase();
    if (v === 'ok' || v === 'connected') return 'text-green-600';
    if (v.includes('error') || v.includes('fail')) return 'text-red-600';
    return 'text-amber-600';
  }

  function statusDot(s: string) {
    const v = String(s).toLowerCase();
    if (v === 'ok' || v === 'connected') return 'bg-green-500';
    if (v.includes('error') || v.includes('fail')) return 'bg-red-500';
    return 'bg-amber-500';
  }

  return (
    <main className="p-6 space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">System Health</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Server, database, cache, and queue status.
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

      {loading && !data ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      ) : data ? (
        <div className="space-y-4">
          {/* Server */}
          <Section title="Server">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-sm">
              <Metric label="Uptime" value={uptimeLabel(data.server.uptime)} />
              <Metric
                label="Memory"
                value={`${data.server.memory.percent.toFixed(1)}%`}
                sub={`${data.server.memory.usedMB.toFixed(0)} / ${data.server.memory.totalMB.toFixed(0)} MB`}
                warn={data.server.memory.percent >= 85}
              />
              <Metric
                label="CPU"
                value={`${data.server.cpuPercent.toFixed(1)}%`}
                warn={data.server.cpuPercent >= 85}
              />
              <Metric label="Node.js" value={data.server.nodeVersion} />
              <Metric label="Environment" value={data.server.environment} />
            </div>

            {/* Memory bar */}
            <div className="mt-3">
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden w-full max-w-xs">
                <div
                  className={`h-full rounded-full transition-all ${
                    data.server.memory.percent >= 90 ? 'bg-red-500' : data.server.memory.percent >= 75 ? 'bg-amber-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(data.server.memory.percent, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Memory usage</p>
            </div>
          </Section>

          {/* Postgres */}
          <Section title="PostgreSQL">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(data.postgres.status)}`} />
                <div>
                  <div className="text-xs text-gray-500">Status</div>
                  <div className={`font-medium ${statusColor(data.postgres.status)}`}>{data.postgres.status}</div>
                </div>
              </div>
              <Metric label="Latency" value={`${data.postgres.latencyMs ?? '—'} ms`} />
              {data.postgres.version && <Metric label="Version" value={data.postgres.version} />}
            </div>
          </Section>

          {/* Redis */}
          <Section title="Redis">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(data.redis.status)}`} />
                <div>
                  <div className="text-xs text-gray-500">Status</div>
                  <div className={`font-medium ${statusColor(data.redis.status)}`}>{data.redis.status}</div>
                </div>
              </div>
              <Metric label="Latency" value={`${data.redis.latencyMs ?? '—'} ms`} />
              {data.redis.connectedClients !== undefined && (
                <Metric label="Connected Clients" value={String(data.redis.connectedClients)} />
              )}
            </div>
          </Section>

          {/* Queues */}
          <Section title="Queues">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <Metric label="Email — Waiting" value={String(data.queues.email.waiting)} />
              <Metric label="Email — Active" value={String(data.queues.email.active)} />
              <Metric
                label="Email — Failed"
                value={String(data.queues.email.failed)}
                warn={data.queues.email.failed > 0}
              />
            </div>
          </Section>
        </div>
      ) : null}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-100 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Metric({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`font-semibold mt-0.5 ${warn ? 'text-amber-600' : 'text-gray-900 dark:text-gray-100'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
