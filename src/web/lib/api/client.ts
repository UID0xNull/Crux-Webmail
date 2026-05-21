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
        const error: ApiError = {
          status: response.status,
          code: body.code || 'HTTP_ERROR',
          message: body.message || `HTTP ${response.status}`,
          details: body.details,
          correlation_id: body.correlation_id || generateCorrelationId(),
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
        throw new Error('Request timed out');
      }

      // Retry with exponential backoff
      if (attempt < attempts - 1) {
        await sleep(RETRY_DELAY * Math.pow(2, attempt));
      }
    }
  }

  throw lastError ?? new Error('Request failed');
}

// ------------------------------------------------------------------
// Auth Token Refresh
// ------------------------------------------------------------------

async function tryRefreshToken(): Promise<boolean> {
  try {
    const refresh = useAuthStore.getState().refreshToken;
    if (!refresh) return false;

    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refresh }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    useAuthStore.getState().setSession(data);
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
