// ============================================================================
// Crux-Webmail — Prometheus Metrics Registry
// ============================================================================
// Custom metrics for IMAP/SMTP operations, auth events, queue status.
// ============================================================================

import { Registry, Counter, Gauge, Histogram } from 'prom-client';

let registry: Registry | null = null;

export function getRegistry(): Registry {
  if (!registry) {
    registry = new Registry();
    setupDefaultMetrics();
  }
  return registry;
}

function setupDefaultMetrics(): void {
  if (!registry) return;

  // Auth metrics
  new Counter({
    name: 'auth_login_attempts_total',
    help: 'Total login attempts',
    labelNames: ['status', 'method'],
    registers: [registry],
  });

  new Counter({
    name: 'auth_mfa_verifications_total',
    help: 'Total MFA verification attempts',
    labelNames: ['status'],
    registers: [registry],
  });

  // IMAP metrics
  new Gauge({
    name: 'imap_active_connections',
    help: 'Active IMAP connections',
    registers: [registry],
  });

  new Counter({
    name: 'imap_fetch_total',
    help: 'Total IMAP fetch operations',
    labelNames: ['folder', 'result'],
    registers: [registry],
  });

  // SMTP metrics
  new Counter({
    name: 'smtp_send_total',
    help: 'Total SMTP send attempts',
    labelNames: ['status'],
    registers: [registry],
  });

  // OpenPGP metrics
  new Histogram({
    name: 'pgp_encrypt_duration_seconds',
    help: 'Time to encrypt message with OpenPGP',
    buckets: [0.1, 0.5, 1, 2, 5],
    registers: [registry],
  });

  new Histogram({
    name: 'pgp_decrypt_duration_seconds',
    help: 'Time to decrypt message with OpenPGP',
    buckets: [0.1, 0.5, 1, 2, 5],
    registers: [registry],
  });

  // Queue metrics
  new Gauge({
    name: 'queue_pending_jobs',
    help: 'Number of pending jobs in BullMQ queues',
    labelNames: ['queue_name'],
    registers: [registry],
  });
}