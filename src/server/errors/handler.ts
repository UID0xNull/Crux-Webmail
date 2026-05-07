// ============================================================================
// Crux-Webmail — Centralized Error Handler
// ============================================================================
// Sanitiza stack traces en producción, asigna correlation IDs,
// y traduce errores internos a respuestas JMAP-compatibles.
// ============================================================================

import { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { generateSecureUuid } from '../utils/crypto';
import { ApiError } from '../types/global';

// ------------------------------------------------------------------
// Códigos de error internos → HTTP mapping
// ------------------------------------------------------------------
const ERROR_CODE_MAP: Record<string, number> = {
  AUTH_FAILED: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_REVOKED: 401,
  FINGERPRINT_MISMATCH: 401,
  SESSION_MAX_CONCURRENT: 429,
  RATE_LIMIT_EXCEEDED: 429,
  INVALID_PAYLOAD: 400,
  INVALID_SCHEMA: 400,
  JMAP_PROTOCOL_ERROR: 400,
  MAILBOX_NOT_FOUND: 404,
  MESSAGE_NOT_FOUND: 404,
  UPLOAD_TOO_LARGE: 413,
  BRIDGE_CONNECTION_FAILED: 503,
  BRIDGE_TIMEOUT: 504,
  DATABASE_ERROR: 500,
  REDIS_ERROR: 503,
  ENCRYPTION_ERROR: 500,
  AMAVIS_ERROR: 502,
  CLAMAV_ERROR: 502,
  INTERNAL_ERROR: 500,
};

// ------------------------------------------------------------------
// Clases de Error Personalizadas
// ------------------------------------------------------------------
export class CruxError extends Error {
  public readonly code: string;
  public readonly correlationId: string;
  public readonly details?: Record<string, unknown>;
  public readonly originalError?: Error;

  constructor(
    code: string,
    message: string,
    options?: {
      details?: Record<string, unknown>;
      originalError?: Error;
    }
  ) {
    super(message);
    this.name = 'CruxError';
    this.code = code;
    this.correlationId = generateSecureUuid();
    this.details = options?.details;
    this.originalError = options?.originalError;
  }
}

// ------------------------------------------------------------------
// Factory functions para errores específicos
// ------------------------------------------------------------------
export function createAuthError(message: string, code = 'AUTH_FAILED'): CruxError {
  return new CruxError(code, message);
}

export function createBridgeError(service: string, message: string): CruxError {
  return new CruxError('BRIDGE_CONNECTION_FAILED', `[${service}] ${message}`);
}

export function createValidationError(message: string, details: Record<string, unknown> = {}): CruxError {
  return new CruxError('INVALID_PAYLOAD', message, { details });
}

export function createRateLimitError(message: string = 'Rate limit exceeded'): CruxError {
  return new CruxError('RATE_LIMIT_EXCEEDED', message);
}

// ------------------------------------------------------------------
// Error Handler para Fastify
// ------------------------------------------------------------------
export function errorHandler(
  error: FastifyError | CruxError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const correlationId = generateSecureUuid();
  const isProduction = process.env.NODE_ENV === 'production';

  // Sanitizar: en producción nunca expone stack traces
  const errorMessage = isProduction
    ? (error.message && !error.message.includes('undefined') ? error.message : 'Internal Server Error')
    : error.message || 'Unknown Error';

  // Mapear código de error
  let statusCode = 500;
  if (error instanceof CruxError) {
    statusCode = ERROR_CODE_MAP[error.code] || 500;
  } else if ('status' in error && typeof (error as any).status === 'number') {
    statusCode = (error as any).status;
  } else if ('statusCode' in error) {
    statusCode = (error as any).statusCode;
  }

  const apiError: ApiError = {
    status: statusCode,
    code: error instanceof CruxError ? error.code : 'INTERNAL_ERROR',
    message: errorMessage,
    details: (isProduction || !(error instanceof CruxError)) ? undefined : error.details,
    correlation_id: correlationId,
  };

  // Log detallado (interno), sanitizado en producción
  if (isProduction) {
    console.error(
      JSON.stringify({
        level: 'error',
        correlation_id: correlationId,
        code: apiError.code,
        status: statusCode,
        timestamp: new Date().toISOString(),
        message: errorMessage,
      })
    );
  }

  reply.code(statusCode).send(apiError);
}

// ------------------------------------------------------------------
// Fastify Plugin — error handler decorator
// ------------------------------------------------------------------
export async function errorPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler(errorHandler);
}

export const globalErrorHandler = errorHandler;