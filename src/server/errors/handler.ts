// ============================================================================
// Crux-Webmail — Centralized Error Handler
// ============================================================================
// Sanitiza stack traces en producción, asigna correlation IDs (desde Fastify),
// y traduce errores internos a respuestas ApiResponse-compatibles.
//
// Formato unificado: todas las respuestas siguen ApiResponse<T>:
//   { data?: T; error?: ApiError; correlation_id: string }
// ============================================================================

import {
  FastifyInstance,
  FastifyError,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import { generateSecureUuid } from 'utils/crypto';
type ApiError = {
  status: number;
  code: string;
  message: string;
  correlation_id: string;
  details?: Record<string, unknown>;
};

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
    },
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

export function createValidationError(
  message: string,
  details: Record<string, unknown> = {},
): CruxError {
  return new CruxError('INVALID_PAYLOAD', message, { details });
}

export function createRateLimitError(message: string = 'Rate limit exceeded'): CruxError {
  return new CruxError('RATE_LIMIT_EXCEEDED', message);
}

// ------------------------------------------------------------------
// Helper: detectar si un error ya tiene HTTP status
// ------------------------------------------------------------------
function isHttpError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'statusCode' in err;
}

// ------------------------------------------------------------------
// Helper: convertir cualquier error a CruxError-like
// ------------------------------------------------------------------
function resolveCruxError(err: unknown): {
  code: string;
  message: string;
  safeMessage: string;
  statusCode?: number;
} {
  if (err instanceof CruxError) {
    return {
      code: err.code,
      message: err.message,
      safeMessage: err.message,
      statusCode: ERROR_CODE_MAP[err.code],
    };
  }

  if (err instanceof Error) {
    return {
      code: (err as any).code ?? 'INTERNAL_ERROR',
      message: err.message,
      safeMessage: 'Internal Server Error',
      statusCode: undefined,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Unknown error',
    safeMessage: 'Internal Server Error',
    statusCode: undefined,
  };
}

// ------------------------------------------------------------------
// Error Handler para Fastify
// ------------------------------------------------------------------
export function errorHandler(
  error: FastifyError | CruxError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const correlationId = (request as any).id ?? generateSecureUuid();
  const isProduction = process.env.NODE_ENV === 'production';

  const crux = resolveCruxError(error);

  const httpStatus = isHttpError(error)
    ? (error as any).statusCode ?? 500
    : crux.statusCode ?? 500;

  // Log detallado (interno), sanitizado en producción
  if (isProduction) {
    console.error(
      JSON.stringify({
        level: 'error',
        correlation_id: correlationId,
        code: crux.code,
        status: httpStatus,
        timestamp: new Date().toISOString(),
        message: crux.safeMessage,
      }),
    );
  } else {
    console.error(
      JSON.stringify({
        level: 'error',
        correlation_id: correlationId,
        code: crux.code,
        status: httpStatus,
        timestamp: new Date().toISOString(),
        message: crux.message,
        stack: (error as Error).stack,
      }),
    );
  }

  // Responder con formato ApiResponse unificado
  const apiError: ApiError = {
    status: httpStatus,
    code: crux.code,
    message: isProduction ? crux.safeMessage : crux.message,
    correlation_id: correlationId,
    ...(error instanceof CruxError && !isProduction ? { details: error.details } : {}),
  };

  reply.code(httpStatus).send({
    error: apiError,
    correlation_id: correlationId,
  });
}

// ------------------------------------------------------------------
// Fastify Plugin — error handler decorator
// ------------------------------------------------------------------
export async function errorPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler(errorHandler);
}

export const globalErrorHandler = errorHandler;