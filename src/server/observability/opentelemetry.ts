// ============================================================================
// Crux-Webmail — OpenTelemetry Configuration
// ============================================================================
// Tracing, metrics, logs para observabilidad completa.
// ============================================================================

export async function initOpenTelemetry(): Promise<void> {
  // Lazy init — only if dependencies are available
  try {
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter(),
      metricExporter: new OTLPMetricExporter(),
    });

    await sdk.start();
    console.log('[OpenTelemetry] SDK started');
  } catch {
    console.warn('[OpenTelemetry] Initialization skipped');
  }
}