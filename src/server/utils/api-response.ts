// ============================================================================
// Crux-Webmail — Unified API Response Helpers
// ============================================================================
// Todas las rutas DEVEN usar estas funciones para garantizar un formato
// uniforme: { data?: T; error?: ApiError; correlation_id: string }
// ============================================================================

import { FastifyReply } from 'fastify';
import { generateSecureUuid } from './crypto';

// API Response Types (inline definitions, no external contracts package)
type ApiError = {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlation_id: string;
};

interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  correlation_id: string;
}

// ------------------------------------------------------------------
// Construye un ApiError con todos los campos requeridos
// ------------------------------------------------------------------
export function buildApiError(
  status: number,
  code: string,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    correlationId?: string;
  }
): ApiError {
  return {
    status,
    code,
    message,
    details: options?.details,
    correlation_id: options?.correlationId ?? generateSecureUuid(),
  };
}

// ------------------------------------------------------------------
// Construye una ApiResponse exitosa
// ------------------------------------------------------------------
export function buildSuccess<T>(
  data: T,
  correlationId?: string
): ApiResponse<T> {
  return {
    data,
    correlation_id: correlationId ?? generateSecureUuid(),
  };
}

// ------------------------------------------------------------------
// Construye una ApiResponse con error
// ------------------------------------------------------------------
export function buildErrorResponse<T>(
  status: number,
  code: string,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    correlationId?: string;
  }
): ApiResponse<T> {
  return {
    error: buildApiError(status, code, message, options),
    correlation_id: options?.correlationId ?? generateSecureUuid(),
  };
}

// ------------------------------------------------------------------
// Envía respuesta exitosa desde Fastify reply
// ------------------------------------------------------------------
export function sendSuccess<T>(
  reply: FastifyReply,
  data: T,
  statusCode: number = 200
): FastifyReply {
  const correlationId = (reply.raw as any).requestId ?? generateSecureUuid();
  return reply.code(statusCode).send(buildSuccess(data, correlationId));
}

// ------------------------------------------------------------------
// Envía respuesta de error desde Fastify reply
// ------------------------------------------------------------------
export function sendError<T>(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  options?: {
    details?: Record<string, unknown>;
    correlationId?: string;
  }
): FastifyReply {
  const correlationId = (reply.raw as any).requestId ?? generateSecureUuid();
  const response = buildErrorResponse<T>(status, code, message, {
    ...options,
    correlationId: options?.correlationId ?? correlationId,
  });
  return reply.code(status).send(response);
}

// ------------------------------------------------------------------
// Envía respuesta desde una try/catch: wrapping automático
// Si la operación devuelve un objeto con `success`, se desestructura.
// ------------------------------------------------------------------
export function sendOperation<T>(
  reply: FastifyReply,
  result: { success: boolean; error?: string } & Record<string, unknown>,
  dataKey?: string
): FastifyReply {
  const correlationId = (reply.raw as any).requestId ?? generateSecureUuid();

  if (!result.success) {
    return sendError<T>(
      reply,
      400,
      result.error ?? 'OPERATION_FAILED',
      result.error ?? 'La operación falló',
      { correlationId }
    );
  }

  // Construir data payload excluyendo `success` y `error`
  const { success, error, ...dataPayload } = result;
  return sendSuccess<T>(reply, dataPayload as T, 200);
}