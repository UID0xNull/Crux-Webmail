// ============================================================================
// Crux-Webmail Frontend — API Client
// Auto-retry, correlation tracking, session refresh, error handling
// ============================================================================

import type { ApiResponse, ApiError } from '../types';
import { useAuthStore } from '../store/auth';

// ------------------------------------------------------------------
// Config
// ------------------------------------------------------------------

const API_BASE = '';
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;
const TIMEOUT_MS = 15_000;

// ------------------------------------------------------------------
// Typed Fetch Wrapper
// ------------------------------------------------------------------

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit & { retry?: boolean; timeout?: number } = {}
): Promise<ApiResponse<T>> {
  const { retry = true, timeout = TIMEOUT_MS, ...fetchOptions } = options;

  let lastError: Error | null = null;
  const attempts = retry ? MAX_RETRIES + 1 : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const headers = await buildHeaders(fetchOptions.headers);

      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        // El backend unifica errores como { error: ApiError, correlation_id }.
        // Toleramos también el formato plano por compatibilidad.
        const payload = (body?.error ?? body) as Partial<ApiError>;
        const code = payload.code || 'HTTP_ERROR';
        const error: ApiError = {
          status: response.status,
          code,
          message: friendlyMessage(code, payload.message, response.status),
          details: payload.details,
          correlation_id:
            payload.correlation_id || body?.correlation_id || generateCorrelationId(),
        };

        // Auto-refresh on 401 (once)
        if (response.status === 401 && attempt === 0) {
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            continue; // retry with new token
          }
        }

        throw new ApiClientError(error);
      }

      return body as ApiResponse<T>;
    } catch (err) {
      lastError = err as Error;

      // Don't retry on client errors or network abort
      if (err instanceof ApiClientError) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiClientError({
          status: 408,
          code: 'REQUEST_TIMEOUT',
          message: STATUS_FALLBACK[408],
          correlation_id: generateCorrelationId(),
        });
      }

      // Retry with exponential backoff
      if (attempt < attempts - 1) {
        await sleep(RETRY_DELAY * Math.pow(2, attempt));
      }
    }
  }

  // Agotados los reintentos: error de red/conexión. No exponer el mensaje
  // crudo del navegador ("Failed to fetch", etc.) al usuario.
  throw new ApiClientError({
    status: 0,
    code: 'NETWORK_ERROR',
    message: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    details: lastError ? { cause: lastError.message } : undefined,
    correlation_id: generateCorrelationId(),
  });
}

// ------------------------------------------------------------------
// Auth Token Refresh
// ------------------------------------------------------------------

async function tryRefreshToken(): Promise<boolean> {
  try {
    const { refreshToken: refresh, sessionId } = useAuthStore.getState();
    if (!refresh || !sessionId) return false;

    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // El backend (RefreshSchema) exige refresh_token + session_id.
      body: JSON.stringify({ refresh_token: refresh, session_id: sessionId }),
    });

    if (!response.ok) return false;

    // Respuesta unificada: { data: AuthToken, correlation_id }.
    const body = await response.json().catch(() => ({}));
    const tokens = body?.data ?? body;
    if (!tokens?.access_token) return false;

    await useAuthStore.getState().setSession(tokens);
    return true;
  } catch {
    // Force logout on refresh failure
    useAuthStore.getState().clearSession();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return false;
  }
}

// ------------------------------------------------------------------
// Headers builder — auto-includes auth + correlation
// ------------------------------------------------------------------

async function buildHeaders(
  customHeaders?: HeadersInit
): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Correlation-ID': generateCorrelationId(),
  };

  if (customHeaders) {
    const custom = new Headers(customHeaders);
    custom.forEach((value, key) => {
      headers[key] = value;
    });
  }

  const token = useAuthStore.getState().token;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // CSRF token for state-changing requests
  const csrf = getCsrfToken();
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }

  return headers;
}

// ------------------------------------------------------------------
// CSRF Token
// ------------------------------------------------------------------

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta?.getAttribute('content') ?? null;
}

// ------------------------------------------------------------------
// Shortcuts
// ------------------------------------------------------------------

export const api = {
  get<T>(endpoint: string, opts?: RequestInit): Promise<ApiResponse<T>> {
    return apiRequest<T>(endpoint, { ...opts, method: 'GET' });
  },

  post<T>(
    endpoint: string,
    body: unknown,
    opts?: RequestInit
  ): Promise<ApiResponse<T>> {
    return apiRequest<T>(endpoint, {
      ...opts,
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  put<T>(
    endpoint: string,
    body: unknown,
    opts?: RequestInit
  ): Promise<ApiResponse<T>> {
    return apiRequest<T>(endpoint, {
      ...opts,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  patch<T>(
    endpoint: string,
    body: unknown,
    opts?: RequestInit
  ): Promise<ApiResponse<T>> {
    return apiRequest<T>(endpoint, {
      ...opts,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  delete<T>(endpoint: string, opts?: RequestInit): Promise<ApiResponse<T>> {
    return apiRequest<T>(endpoint, { ...opts, method: 'DELETE' });
  },
};

// ------------------------------------------------------------------
// Error classes
// ------------------------------------------------------------------

export class ApiClientError extends Error {
  constructor(public error: ApiError) {
    super(error.message);
    this.name = 'ApiClientError';
  }

  get status(): number {
    return this.error.status;
  }

  get code(): string {
    return this.error.code;
  }

  get correlationId(): string {
    return this.error.correlation_id;
  }
}

// ------------------------------------------------------------------
// Utilities
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Friendly error messages — traduce códigos del backend a texto para
// el usuario. Garantiza que nunca se muestre JSON crudo ni jerga técnica.
// ------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_FAILED: 'Usuario o contraseña incorrectos.',
  INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos.',
  TOKEN_EXPIRED: 'Tu sesión expiró. Inicia sesión nuevamente.',
  TOKEN_REVOKED: 'Tu sesión fue revocada. Inicia sesión nuevamente.',
  INVALID_SESSION: 'Tu sesión no es válida. Inicia sesión nuevamente.',
  MISSING_AUTH_TOKEN: 'Tu sesión no es válida. Inicia sesión nuevamente.',
  FINGERPRINT_MISMATCH:
    'Detectamos un dispositivo distinto. Por seguridad, inicia sesión nuevamente.',
  SESSION_MAX_CONCURRENT:
    'Alcanzaste el máximo de sesiones activas. Cierra otra sesión e inténtalo de nuevo.',
  RATE_LIMIT_EXCEEDED:
    'Demasiados intentos. Espera unos minutos antes de volver a intentar.',
  INVALID_PAYLOAD: 'Revisa los datos ingresados e inténtalo de nuevo.',
  INVALID_SCHEMA: 'Revisa los datos ingresados e inténtalo de nuevo.',
  ACCOUNT_LOCKED:
    'Tu cuenta está bloqueada temporalmente por seguridad. Inténtalo más tarde.',
  ACCOUNT_DISABLED: 'Tu cuenta está deshabilitada. Contacta al administrador.',
  MFA_REQUIRED: 'Ingresa tu código de verificación para continuar.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado. Inténtalo de nuevo en unos momentos.',
  DATABASE_ERROR: 'El servicio no está disponible en este momento. Inténtalo más tarde.',
  REDIS_ERROR: 'El servicio no está disponible en este momento. Inténtalo más tarde.',
  BRIDGE_CONNECTION_FAILED:
    'No pudimos conectar con el servidor de correo. Inténtalo más tarde.',
  BRIDGE_TIMEOUT: 'El servidor tardó demasiado en responder. Inténtalo de nuevo.',
};

const STATUS_FALLBACK: Record<number, string> = {
  400: 'Revisa los datos ingresados e inténtalo de nuevo.',
  401: 'Usuario o contraseña incorrectos.',
  403: 'No tienes permisos para realizar esta acción.',
  404: 'No encontramos lo que buscabas.',
  408: 'La solicitud tardó demasiado. Inténtalo de nuevo.',
  429: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.',
  500: 'Ocurrió un error inesperado. Inténtalo de nuevo en unos momentos.',
  502: 'El servicio no está disponible en este momento. Inténtalo más tarde.',
  503: 'El servicio no está disponible en este momento. Inténtalo más tarde.',
  504: 'El servidor tardó demasiado en responder. Inténtalo de nuevo.',
};

/** Heurística: detecta mensajes que no deberían mostrarse al usuario. */
function looksTechnical(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true;
  // JSON crudo (arrays/objetos de errores Zod, stack traces, etc.)
  if (/^[[{]/.test(trimmed)) return true;
  if (trimmed.length > 160) return true;
  if (/\b(undefined|null|stack|at\s.+:\d+|Error:)\b/.test(trimmed)) return true;
  return false;
}

function friendlyMessage(
  code: string,
  serverMessage: string | undefined,
  status: number
): string {
  // 1) Mapeo por código conocido (preferido).
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];

  // 2) Mensaje del servidor, sólo si es legible y no técnico.
  if (serverMessage && !looksTechnical(serverMessage)) return serverMessage;

  // 3) Fallback por status HTTP.
  return STATUS_FALLBACK[status] ?? 'Ocurrió un error. Inténtalo de nuevo.';
}

function generateCorrelationId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
