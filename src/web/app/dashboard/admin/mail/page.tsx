'use client';

import React, { useEffect, useState } from 'react';
import { getMailSystemStats } from 'lib/api/admin';
import type { AdminMailSystemStats } from 'lib/types';

export default function AdminMailPage() {
  const [data, setData] = useState<AdminMailSystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await getMailSystemStats();
      setData(d);
      setRefreshed(new Date());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load mail system stats');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="p-6 space-y-6 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Mail System</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Status of all mail infrastructure components.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ServiceCard
            name="Postfix"
            status={data.postfix.status}
            host={data.postfix.host}
            metrics={data.postfix.queue_size !== null ? [{ label: 'Queue Size', value: String(data.postfix.queue_size) }] : []}
          />
          <ServiceCard
            name="Dovecot"
            status={data.dovecot.status}
            host={data.dovecot.host}
            metrics={data.dovecot.active_users !== null ? [{ label: 'Active Users', value: String(data.dovecot.active_users) }] : []}
          />
          <ServiceCard
            name="Amavis"
            status={data.amavis.status}
            host={data.amavis.host}
            metrics={data.amavis.quarantine_count !== null ? [{ label: 'Quarantined', value: String(data.amavis.quarantine_count) }] : []}
          />
          <ServiceCard
            name="ClamAV"
            status={data.clamav.status}
            host={data.clamav.host}
            metrics={[]}
          />
          <ServiceCard
            name="MinIO"
            status={data.minio.status}
            host={data.minio.host}
            metrics={data.minio.used_bytes !== null ? [{ label: 'Used Storage', value: fmtBytes(data.minio.used_bytes) }] : []}
          />
        </div>
      ) : null}
    </main>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function ServiceCard({
  name,
  status,
  host,
  metrics,
}: {
  name: string;
  status: string;
  host: string;
  metrics: Array<{ label: string; value: string }>;
}) {
  const v = String(status).toLowerCase();
  const isOk = v === 'ok' || v === 'connected' || v === 'running';
  const isFail = v.includes('error') || v.includes('fail') || v === 'unreachable';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{name}</h2>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isOk ? 'bg-green-500' : isFail ? 'bg-red-500' : 'bg-amber-500'}`} />
          <span className={`text-xs font-medium ${isOk ? 'text-green-600' : isFail ? 'text-red-600' : 'text-amber-600'}`}>
            {status}
          </span>
        </div>
      </div>
      <div className="text-xs text-gray-500 font-mono truncate">{host}</div>
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          {metrics.map(({ label, value }) => (
            <div key={label}>
              <div className="text-[10px] text-gray-400">{label}</div>
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
