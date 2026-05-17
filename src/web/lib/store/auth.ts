// ============================================================================
// Crux-Webmail Frontend — Auth Store (Zustand)
// Manages session state, token lifecycle, Zero-Trust fingerprint
// ============================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AuthToken,
  SessionState,
  UserProfile,
  LoginPayload,
  ClientFingerprint,
} from '../types';
import { api, ApiClientError } from '../api/client';

interface AuthStore extends SessionState {
  // Actions
  login: (payload: LoginPayload) => Promise<boolean>;
  logout: () => Promise<void>;
  setSession: (tokens: AuthToken) => Promise<void>;
  clearSession: () => void;
  updateFingerprint: (fp: ClientFingerprint) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // ------------------------------------------------------------------
      // Initial State
      // ------------------------------------------------------------------
      isAuthenticated: false,
      token: null,
      refreshToken: null,
      sessionId: null,
      user: null,
      expiresAt: 0,
      fingerprint: null,
      isLoading: false,
      error: null,

      // ------------------------------------------------------------------
      // Login
      // ------------------------------------------------------------------
      login: async (payload: LoginPayload) => {
        set({ isLoading: true, error: null });

        try {
          const response = await api.post<AuthToken>('/api/auth/login', {
            username: payload.username,
            password: payload.password,
            client_fingerprint: payload.client_fingerprint,
            ip: payload.ip,
            cert_serial: payload.cert_serial,
          });

          const tokens = response.data;
          await get().setSession(tokens);

          set({
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          return true;
        } catch (err) {
          let message = 'Authentication failed';
          if (err instanceof ApiClientError) {
            message = err.message;
          } else if (err instanceof Error) {
            message = err.message;
          }

          set({
            isAuthenticated: false,
            isLoading: false,
            error: message,
          });
          return false;
        }
      },

      // ------------------------------------------------------------------
      // Logout
      // ------------------------------------------------------------------
      logout: async () => {
        const { token, sessionId } = get();

        try {
          if (token && sessionId) {
            // Inform backend to revoke session
            await api.post('/api/auth/logout', {
              session_id: sessionId,
            }).catch(() => {
              // Best-effort: don't block logout on backend failure
            });
          }
        } finally {
          get().clearSession();
        }
      },

      // ------------------------------------------------------------------
      // Set Session — fetches user profile
      // ------------------------------------------------------------------
      setSession: async (tokens: AuthToken) => {
        const now = Date.now();
        const expiresAt = now + tokens.expires_in * 1000;

        set({
          token: tokens.access_token,
          refreshToken: tokens.refresh_token,
          sessionId: tokens.session_id,
          expiresAt,
        });

        // Sync cookie so middleware can validate on SSR / hard refresh
        if (typeof document !== 'undefined' && tokens.access_token) {
          setAuthCookie(tokens.access_token, tokens.expires_in);
        }

        // Load user profile
        try {
          const profileResp = await api.get<UserProfile>('/api/auth/profile');
          set({ user: profileResp.data });
        } catch {
          // Keep session even if profile fails
          console.warn('[Auth] Could not load user profile');
        }

        // Schedule token expiry check
        scheduleExpiryCheck(expiresAt);
      },

      // ------------------------------------------------------------------
      // Clear Session
      // ------------------------------------------------------------------
      clearSession: () => {
        set({
          isAuthenticated: false,
          token: null,
          refreshToken: null,
          sessionId: null,
          user: null,
          expiresAt: 0,
          isLoading: false,
          error: null,
        });
        // Remove auth cookie so middleware sees the logout
        if (typeof document !== 'undefined') {
          clearAuthCookie();
        }
      },

      // ------------------------------------------------------------------
      // Update Fingerprint
      // ------------------------------------------------------------------
      updateFingerprint: (fp: ClientFingerprint) => {
        set({ fingerprint: fp });
      },
    }),
    {
      name: 'crux-auth-storage',
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        sessionId: state.sessionId,
        expiresAt: state.expiresAt,
      }),
    }
  )
);

// ------------------------------------------------------------------
// Token expiry check — auto-logout when access token expires
// ------------------------------------------------------------------
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleExpiryCheck(expiresAt: number): void {
  if (expiryTimer) clearTimeout(expiryTimer);

  const delay = Math.max(expiresAt - Date.now() - 30_000, 0);

  expiryTimer = setTimeout(() => {
    // Try refresh 30s before expiry
    const currentExpires = useAuthStore.getState().expiresAt;
    if (currentExpires <= Date.now()) {
      useAuthStore.getState().clearSession();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }, delay);
}

// ------------------------------------------------------------------
// Cookie helpers — keep middleware + client in sync
// ------------------------------------------------------------------
const AUTH_COOKIE_NAME = 'crux_access_token';

function setAuthCookie(token: string, expiresIn: number): void {
  const maxAge = Math.max(expiresIn, 60);
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  document.cookie = `${AUTH_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; SameSite=Lax; ${typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'Secure;' : ''}`;
}

function clearAuthCookie(): void {
  document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0`;
  document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; Secure;`;
}

function syncCookieFromStore(): void {
  const token = useAuthStore.getState().token;
  const expiresAt = useAuthStore.getState().expiresAt;
  if (token && expiresAt && expiresAt > Date.now()) {
    const remainingSec = Math.max(Math.floor((expiresAt - Date.now()) / 1000), 60);
    setAuthCookie(token, remainingSec);
  } else {
    if (typeof document !== 'undefined') clearAuthCookie();
  }
}

// ------------------------------------------------------------------
// Hydrate on load: validate persisted session
// ------------------------------------------------------------------
export async function hydrateAuth(): Promise<boolean> {
  const state = useAuthStore.getState();
  if (!state.token) return false;

  try {
    const profileResp = await api.get<UserProfile>('/api/auth/profile');
    useAuthStore.setState({ isAuthenticated: true, user: profileResp.data });
    syncCookieFromStore();
    scheduleExpiryCheck(state.expiresAt);
    return true;
  } catch {
    useAuthStore.getState().clearSession();
    return false;
  }
}
