'use client';

import React, { useEffect, useState } from 'react';
import { getAppSettings } from 'lib/api/admin';
import type { AdminAppSettings } from 'lib/types';

export default function AdminSettingsPage() {
  const [data, setData] = useState<AdminAppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await getAppSettings();
        setData(d);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function fmtMs(ms: number): string {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  return (
    <main className="p-6 space-y-6 max-w-screen-xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">App Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Read-only view of the current application configuration.</p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
      ) : data ? (
        <div className="space-y-4">
          <Section title="General">
            <Row label="App Name" value={data.app_name} />
            <Row label="Version" value={data.app_version} />
            <Row label="Environment" value={data.environment} />
            <Row label="Maintenance Mode" value={<BoolBadge on={data.maintenance_mode} onLabel="ON" offLabel="Off" onAccent="red" />} />
            <Row label="Registration Open" value={<BoolBadge on={data.registration_open} onLabel="Open" offLabel="Closed" />} />
          </Section>

          <Section title="Password Policy">
            <Row label="Min Length" value={String(data.min_password_length)} />
            <Row label="Max Length" value={String(data.max_password_length)} />
          </Section>

          <Section title="Session">
            <Row label="Session TTL" value={fmtMs(data.session_ttl_ms)} />
            <Row label="Max Concurrent Sessions" value={String(data.max_concurrent_sessions)} />
            <Row label="MFA Required" value={<BoolBadge on={data.mfa_required} onLabel="Required" offLabel="Optional" onAccent="amber" />} />
          </Section>

          <Section title="Rate Limits">
            <Row label="API Limit (RPM)" value={`${data.rate_limit_api_rpm} req/min`} />
            <Row label="Auth Limit (RPM)" value={`${data.rate_limit_auth_rpm} req/min`} />
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
      <dl className="divide-y divide-gray-100 dark:divide-gray-800">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  );
}

function BoolBadge({
  on,
  onLabel,
  offLabel,
  onAccent,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  onAccent?: 'red' | 'amber' | 'green';
}) {
  if (on) {
    const cls =
      onAccent === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
      onAccent === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    return <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${cls}`}>{onLabel}</span>;
  }
  return <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800">{offLabel}</span>;
}
