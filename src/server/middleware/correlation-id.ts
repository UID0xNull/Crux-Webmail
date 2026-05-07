// ============================================================================
// Crux-Webmail — Correlation ID Middleware
// ============================================================================
// Inyecta un trace_id único por request para correlacionar logs, métricas
// y trazas en todo el stack (Loki, Prometheus, Grafana).
// ============================================================================

import { FastifyPluginCallback } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

export const correlationIdPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.addHook('onRequest', async (request, reply) => {
    // Usar trace-id del cliente si ya existe (propagación), o generar uno nuevo
    const traceId =
      request.headers['x-correlation-id'] ||
      request.headers['x-request-id'] ||
      request.headers['traceparent'] ||
      uuidv4();

    // Injectar en el request context para acceso en cualquier hook/route
    (request as any).correlationId = traceId;

    // Retornar en la respuesta para rastreo del cliente
    reply.header('X-Correlation-ID', traceId);

    // Enrichar el logger de Fastify para que todos los logs de esta request
    // incluyan el correlation_id
    request.log = request.log.child({ correlation_id: traceId });
  });

  done();
};