import { useState, useEffect, useCallback, useRef } from 'react';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
interface UseAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  sessionId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

// ------------------------------------------------------------------
// Storage keys
// ------------------------------------------------------------------
const STORAGE_KEY_ACCESS = 'crux:access_token';
const STORAGE_KEY_REFRESH = 'crux:refresh_token';
const STORAGE_KEY_SESSION = 'crux:session_id';
const STORAGE_KEY_USER = 'crux:user_id';

// ------------------------------------------------------------------
// API base
// ------------------------------------------------------------------
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// ------------------------------------------------------------------
// Helper: read from localStorage (client-side only)
// ------------------------------------------------------------------
function getStorage<T = string>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') as T;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------
// Main auth hook
// ------------------------------------------------------------------
export function useAuth(): {
  state: UseAuthState;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
} {
  const [state, setState] = useState<UseAuthState>({
    accessToken: null,
    refreshToken: null,
    userId: null,
    sessionId: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ----------------------------------------------------------------
  // Initialize: restore session from storage
  // ----------------------------------------------------------------
  useEffect(() => {
    setState({
      accessToken: getStorage(STORAGE_KEY_ACCESS),
      refreshToken: getStorage(STORAGE_KEY_REFRESH),
      userId: getStorage(STORAGE_KEY_USER),
      sessionId: getStorage(STORAGE_KEY_SESSION),
      isLoading: false,
      isAuthenticated: true,
      error: null,
    });
  }, []);

  // ----------------------------------------------------------------
  // Auto-refresh every 4 minutes
  // ----------------------------------------------------------------
  const doRefresh = useCallback(async () => {
    const token = state.accessToken;
    const refresh = state.refreshToken;
    const sid = state.sessionId;
    if (!token || !refresh || !sid) return;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh, session_id: sid }),
      });
      if (!res.ok) throw new Error('Refresh failed');
      const data = await res.json();
      localStorage.setItem(STORAGE_KEY_ACCESS, JSON.stringify(data.access_token));
      setState(prev => ({ ...prev, accessToken: data.access_token }));
    } catch {
      await doLogout();
    }
  }, [state.accessToken, state.refreshToken, state.sessionId]);

  useEffect(() => {
    if (state.isAuthenticated && state.refreshToken) {
      refreshTimerRef.current = setInterval(doRefresh, 4 * 60 * 1000);
    }
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [state.isAuthenticated, state.refreshToken, doRefresh]);

  // ----------------------------------------------------------------
  // Login
  // ----------------------------------------------------------------
  const login = useCallback(async (username: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const fingerprint = {
        browser: navigator.userAgent.split(' ').slice(-1)[0],
        os: navigator.userAgent,
        screen: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        languages: navigator.languages,
      };
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, device_fingerprint: fingerprint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');

      localStorage.setItem(STORAGE_KEY_ACCESS, JSON.stringify(data.access_token));
      localStorage.setItem(STORAGE_KEY_REFRESH, JSON.stringify(data.refresh_token));
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(data.session_id));
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(username));

      setState({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        userId: username,
        sessionId: data.session_id,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });
    } catch (err) {
      setState(prev => ({ ...prev, isLoading: false, error: (err as Error).message }));
    }
  }, []);

  // ----------------------------------------------------------------
  // Logout
  // ----------------------------------------------------------------
  const doLogout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.accessToken}`,
        },
        body: JSON.stringify({ session_id: state.sessionId }),
      });
    } catch {
      // Ignore errors during logout
    } finally {
      localStorage.removeItem(STORAGE_KEY_ACCESS);
      localStorage.removeItem(STORAGE_KEY_REFRESH);
      localStorage.removeItem(STORAGE_KEY_SESSION);
      localStorage.removeItem(STORAGE_KEY_USER);
      setState({
        accessToken: null,
        refreshToken: null,
        userId: null,
        sessionId: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      });
    }
  }, [state.accessToken, state.sessionId]);

  const clearError = useCallback(() => setState(prev => ({ ...prev, error: null })), []);

  return { state, login, logout: doLogout, clearError };
}

// ------------------------------------------------------------------
// Hook for protected API calls
// ------------------------------------------------------------------
export function useApiFetch(): (url: string, options?: RequestInit) => Promise<Response> {
  const { state } = useAuth();
  return useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
    const headers = new Headers(options.headers);
    if (state.accessToken) headers.set('Authorization', `Bearer ${state.accessToken}`);
    headers.set('Content-Type', 'application/json');
    return fetch(fullUrl, { ...options, headers });
  }, [state.accessToken]);
}