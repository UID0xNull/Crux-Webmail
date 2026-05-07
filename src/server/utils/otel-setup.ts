// ============================================================================
// Crux-Webmail — OpenTelemetry Setup (Distributed Tracing)
// ============================================================================
// Configura tracing distribuido via OTLP HTTP exporter. Propaga traces
// entre Fastify backend, PostgreSQL, Redis, BullMQ y downstream (SMTP/IMAP).
// ============================================================================

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import {
  HttpInstrumentation,
  FsInstrumentation,
} from '@opentelemetry/instrumentation-http';
import { v4 as uuidv4 } from 'uuid';

let sdk: NodeSDK | null = null;

// ------------------------------------------------------------------
// Inicializar SDK de OpenTelemetry
// ------------------------------------------------------------------
export function initOpenTelemetry(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const otlpEndpoint = process.env.OTLP_ENDPOINT || 'http://localhost:4318';

  if (!isProd && process.env.OTLP_DISABLED !== 'true') {
    console.log('[OTEL] Development mode — traces sent to console');
  }

  sdk = new NodeSDK({
    // --- Trace Configuration ---
    traceExporter: new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
      headers: {},
    }),

    // --- Metric Configuration ---
    metricExporter: new OTLPMetricExporter({
      url: `${otlpEndpoint}/v1/metrics`,
      headers: {},
    }),

    // --- Auto-instrumentations ---
    instrumentations: [
      new HttpInstrumentation({
        ignoreOutgoingUrls: ['/health', '/ready', '/metrics'],
      }),
      new FsInstrumentation(),
    ],

    // --- Resource identification ---
    resource: {
      service: {
        name: 'crux-webmail-backend',
        version: '2.0.0-zero-trust',
        namespace: 'crux-webmail',
      },
      environment: process.env.NODE_ENV || 'development',
    },

    // --- Sampling ---
    spanProcessors: [],
  });

  sdk.start();

  console.log(`[OTEL] Tracing initialized → ${otlpEndpoint}`);
}

// ------------------------------------------------------------------
// Shutdown
// ------------------------------------------------------------------
export async function shutdownOpenTelemetry(): Promise<void> {
  try {
    await sdk?.shutdown();
    console.log('[OTEL] Tracing shutdown complete');
  } catch (err) {
    console.error('[OTEL] Shutdown error:', (err as Error).message);
  }
}

// ------------------------------------------------------------------
// Generate trace context for correlation across services
// ------------------------------------------------------------------
export function generateTraceContext() {
  return {
    trace_id: uuidv4().replace(/-/g, ''),
    timestamp: Date.now(),
  };
}

// ------------------------------------------------------------------
// Export default
// ------------------------------------------------------------------
export default initOpenTelemetry;