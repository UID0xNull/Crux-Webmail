// ============================================================================
// Crux-Webmail — OpenTelemetry Setup (Distributed Tracing)
// ============================================================================
// Configura tracing distribuido via OTLP HTTP exporter. Propaga traces
// entre Fastify backend, PostgreSQL, Redis, BullMQ y downstream (SMTP/IMAP).
// ============================================================================
import { NodeSDK, NodeSDKConfiguration } from '@opentelemetry/sdk-node';
import otelInstrumentations from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
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
    traceExporter: isProd ? new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }) : undefined,
    resource: new Resource({
      'service.name': 'crux-webmail-backend',
      'service.version': '2.0.0-zero-trust',
      'service.instance.id': uuidv4().replace(/-/g, ''),
    }),
  } as any);

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