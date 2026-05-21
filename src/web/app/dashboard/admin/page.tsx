'use client';

import React, { useEffect, useState } from 'react';
import { getAdminDashboard } from 'lib/api/admin';
import type { AdminDashboardData } from 'lib/types';

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const d = await getAdminDashboard();
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load dashboard data');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-50">Admin Dashboard</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-50">Admin Dashboard</h1>
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 inline-block">
          {error ?? 'Failed to load dashboard data.'}
        </div>
      </div>
    );
  }

  return (
    <main className="p-6 space-y-6 max-w-screen-xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">High-level system overview.</p>
      </header>

      {/* System health summary */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <HealthCard label="Uptime" value={uptimeLabel(data.system.server.uptime)} />
        <HealthCard label="Memory" value={`${data.system.server.memory.percent.toFixed(0)}%`} accent={tooHigh(data.system.server.memory.percent, 85)} />
        <HealthCard label="CPU" value={`${data.system.server.cpuPercent.toFixed(0)}%`} accent={tooHigh(data.system.server.cpuPercent, 85)} />
        <HealthCard
          label="Postgres"
          value={statusLabel(data.system.postgres.status)}
          accent={isFail(data.system.postgres.status) ? 'red' : undefined}
        />
      </section>

      {/* Users */}
      <section className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
        <h2 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-100">Users</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
          <Stat label="Total" value={data.users.total} />
          <Stat label="Active" value={data.users.active} />
          <Stat label="Inactive" value={data.users.inactive} />
          <Stat label="MFA Enabled" value={data.users.withMFA} />
          <Stat label="Locked" accent="amber" value={data.users.locked} />
        </div>
      </section>

      {/* Audit summary */}
      <section className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
        <h2 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-100">Audit Log Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
          <Stat label="Total Events" value={data.audits.total} />
          <Stat label="Last 24h" accent="blue" value={data.audits.last24h} />
          <Stat label="Critical" accent="red" value={data.audits.criticalEvents} />
        </div>
      </section>

      {/* Recent activity */}
      {data.recentActivity && data.recentActivity.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-4">
          <h2 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-100">Recent Activity</h2>
          <ul className="space-y-2 max-h-64 overflow-auto text-xs">
            {data.recentActivity.map((a) => (
              <li key={`${a.timestamp}-${Math.random()}`} className="flex gap-3">
                <div className="w-18 text-[10px] text-gray-500 pt-1">{a.timestamp}</div>
                <div>
                  <span className="font-medium">{a.type}</span>
                  <span className="text-gray-600 dark:text-gray-300 ml-2">— {a.description}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

// ------------------------------------------------------------------
// Small helpers / inline components (same file to keep admin UX self-contained)
// ------------------------------------------------------------------

function HealthCard({ label, value, accent }: { label: string; value: string; accent?: 'amber' | 'red' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:bg-gray-900 dark:border-gray-800 p-4 flex flex-col gap-1">
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`text-sm font-semibold ${
          accent === 'red'
            ? 'text-red-600'
            : accent === 'amber'
              ? 'text-amber-600'
              : 'text-gray-900 dark:text-gray-50'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'blue' | 'red' | 'amber' }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-gray-500">{label}</span>
      <span
        className={`font-semibold ${
          accent === 'blue' ? 'text-blue-600' : accent === 'red' ? 'text-red-600' : accent === 'amber' ? 'text-amber-600' : ''
        }`}
      >
        {value ?? '-'}
      </span>
    </div>
  );
}

function uptimeLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  if (h < 1) return `${seconds}s`;
  const d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h`;
}

function statusLabel(s: string) {
  if (!s) return '-';
  return s === 'ok' || s === 'connected' ? 'OK' : (s ?? '-');
}

function isFail(s: string): boolean {
  const v = String(s ?? '').toLowerCase();
  return ['error', 'fail', 'failed'].some((k) => v.includes(k));
}

function tooHigh(v: number, threshold: number) {
  if (v >= threshold + 10) return 'red';
  if (v >= threshold) return 'amber';
  return undefined;
}