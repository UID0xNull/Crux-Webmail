// ============================================================================
// Crux-Webmail — Prometheus Metrics Middleware
// ============================================================================
// Expone métricas HTTP (requests total, duración, estado HTTP) y métricas
// custom de negocio (colas BullMQ, conexiones Redis/Postgres, etc.)
// ============================================================================

import { FastifyPluginCallback } from 'fastify';
import fastifyPrometheus from '@fastify/prometheus';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// ------------------------------------------------------------------
// Registro global — compartido entre middleware y app
// ------------------------------------------------------------------
export const metricsRegistry = new Registry();

// Recopilar métricas de Node.js (memoria, CPU, GC, event loop)
collectDefaultMetrics({ register: metricsRegistry });

// ------------------------------------------------------------------
// Métricas custom de negocio
// ------------------------------------------------------------------

// Colas BullMQ
export const queuePendingGauge = new Gauge({
  name: 'crux_mail_queue_pending_messages',
  help: 'Número de mensajes pendientes en colas BullMQ',
  labelNames: ['queue_name'],
  registers: [metricsRegistry],
});

export const queueProcessedCounter = new Counter({
  name: 'crux_mail_queue_processed_total',
  help: 'Total de mensajes procesados por colas BullMQ',
  labelNames: ['queue_name', 'status'],
  registers: [metricsRegistry],
});

// Conexiones
export const dbConnectionsGauge = new Gauge({
  name: 'crux_postgres_pool_active',
  help: 'Conexiones activas en el pool de PostgreSQL',
  registers: [metricsRegistry],
});

export const redisConnectedGauge = new Gauge({
  name: 'crux_redis_connected',
  help: 'Estado de conexión a Redis (1=connected, 0=disconnected)',
  registers: [metricsRegistry],
});

// IMAP/SMTP bridges
export const imapPoolGauge = new Gauge({
  name: 'crux_imap_pool_size',
  help: 'Tamaño del pool de conexiones IMAP',
  registers: [metricsRegistry],
});

export const smtpSentCounter = new Counter({
  name: 'crux_smtp_sent_total',
  help: 'Total de correos enviados vía SMTP',
  labelNames: ['tls_used', 'dkim_signed'],
  registers: [metricsRegistry],
});

// Seguridad
export const authFailuresCounter = new Counter({
  name: 'crux_auth_failures_total',
  help: 'Intentos fallidos de autenticación',
  labelNames: ['reason'],
  registers: [metricsRegistry],
});

export const rateLimitedCounter = new Counter({
  name: 'crux_rate_limited_total',
  help: 'Requests bloqueados por rate limiting',
  registers: [metricsRegistry],
});

// Performance custom
export const mimeParseDuration = new Histogram({
  name: 'crux_mime_parse_duration_seconds',
  help: 'Tiempo de parseo de mensajes MIME',
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const emailProcessDuration = new Histogram({
  name: 'crux_email_process_duration_seconds',
  help: 'Tiempo total de procesamiento de un email (recepción a almacenamiento)',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [metricsRegistry],
});

// ------------------------------------------------------------------
// Plugin Fastify: expone métricas en /metrics
// ------------------------------------------------------------------
export const prometheusPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.register(fastifyPrometheus, {
    endpoint: '/metrics',
    registry: metricsRegistry,
    defaultMetrics: { register: metricsRegistry },
    metricType: 'metrics',
  });

  done();
};