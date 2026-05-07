// ============================================================================
// Crux-Webmail — Unit Tests: Auth Store (Zustand)
// ============================================================================

import { act } from 'react';
import { useAuthStore, hydrateAuth } from 'src/web/lib/store/auth';

// ------------------------------------------------------------------
// Mock API client
// ------------------------------------------------------------------
jest.mock('src/web/lib/api/client', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(public error: any) {
      super(error.message);
      this.name = 'ApiClientError';
    }
  },
}));

import { api, ApiClientError } from 'src/web/lib/api/client';
const mockApi = api as jest.Mocked<typeof api>;

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function createAuthToken(overrides = {}) {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    session_id: 'sess-001',
    expires_in: 3600,
    correlation_id: 'cor-test',
    ...overrides,
  };
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------
describe('Auth Store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Reset auth state after each test
    useAuthStore.getState().clearSession();
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const tokens = createAuthToken();

      mockApi.post.mockResolvedValueOnce({
        data: tokens,
        status: 200,
        correlation_id: 'cor-login',
        timestamp: new Date().toISOString(),
      });

      mockApi.get.mockResolvedValueOnce({
        data: {
          user_id: 'u1',
          email: 'test@example.com',
          display_name: 'Test User',
          roles: ['user'],
          mfa_enabled: false,
          last_login: new Date().toISOString(),
          sessions: [],
        },
        status: 200,
        correlation_id: 'cor-profile',
        timestamp: new Date().toISOString(),
      });

      let result: boolean;
      await act(async () => {
        result = await useAuthStore.getState().login({
          username: 'test',
          password: 'password',
          client_fingerprint: 'fp-123',
          ip: '127.0.0.1',
          cert_serial: 'cert-1',
        });
      });

      expect(result).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().token).toBe('test-access-token');
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should fail on wrong credentials', async () => {
      const apiError = new ApiClientError({
        status: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
        correlation_id: 'cor-fail',
      });
      mockApi.post.mockRejectedValueOnce(apiError);

      let result: boolean;
      await act(async () => {
        result = await useAuthStore.getState().login({
          username: 'test',
          password: 'wrong',
          client_fingerprint: 'fp-123',
          ip: '127.0.0.1',
          cert_serial: 'cert-1',
        });
      });

      expect(result).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().error).toBeTruthy();
    });

    it('should handle generic errors', async () => {
      mockApi.post.mockRejectedValueOnce(new Error('Network failure'));

      let result: boolean;
      await act(async () => {
        result = await useAuthStore.getState().login({
          username: 'test',
          password: 'pass',
          client_fingerprint: 'fp',
          ip: '1.2.3.4',
          cert_serial: 'c1',
        });
      });

      expect(result).toBe(false);
      expect(useAuthStore.getState().error).toContain('Network failure');
    });
  });

  describe('logout', () => {
    it('should clear session', async () => {
      // Setup: login first
      useAuthStore.setState({
        isAuthenticated: true,
        token: 'my-token',
        refreshToken: 'refresh',
        sessionId: 'sess-current',
        user: {
          user_id: 'u1',
          email: 'test@example.com',
          display_name: 'User',
          roles: [],
          mfa_enabled: false,
          last_login: '',
          sessions: [],
        },
        expiresAt: Date.now() + 3600000,
        fingerprint: null,
      });

      mockApi.post.mockResolvedValueOnce({
        data: {},
        status: 200,
        correlation_id: 'cor-logout',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().refreshToken).toBeNull();
      expect(useAuthStore.getState().sessionId).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();

      // Verify backend was called
      expect(mockApi.post).toHaveBeenCalledWith('/api/auth/logout', {
        session_id: 'sess-current',
      });
    });

    it('should clear session even if backend fails', async () => {
      useAuthStore.setState({
        isAuthenticated: true,
        token: 'my-token',
        refreshToken: 'refresh',
        sessionId: 'sess-current',
        user: null,
        expiresAt: Date.now() + 3600000,
        fingerprint: null,
      });

      mockApi.post.mockRejectedValueOnce(new Error('Backend unreachable'));

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('clearSession', () => {
    it('should reset all session state', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        token: 'some-token',
        refreshToken: 'some-refresh',
        sessionId: 'some-session',
        user: {
          user_id: 'u1',
          email: 'test@example.com',
          display_name: 'User',
          roles: [],
          mfa_enabled: false,
          last_login: '',
          sessions: [],
        },
        expiresAt: 999999,
        fingerprint: {
          browser: 'chrome',
          os: 'linux',
          screen: '1920x1080',
          timezone: 'UTC',
          languages: ['en'],
          hash: 'abc',
        },
      });

      act(() => {
        useAuthStore.getState().clearSession();
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().refreshToken).toBeNull();
      expect(useAuthStore.getState().sessionId).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().expiresAt).toBe(0);
    });
  });

  describe('updateFingerprint', () => {
    it('should update client fingerprint', () => {
      const fp = {
        browser: 'firefox',
        os: 'windows',
        screen: '1366x768',
        timezone: 'America/New_York',
        languages: ['es', 'en'],
        hash: 'def456',
      };

      act(() => {
        useAuthStore.getState().updateFingerprint(fp);
      });

      expect(useAuthStore.getState().fingerprint).toEqual(fp);
    });
  });

  describe('setSession', () => {
    it('should set tokens and load profile', async () => {
      const tokens = createAuthToken();

      mockApi.get.mockResolvedValueOnce({
        data: {
          user_id: 'u2',
          email: 'user@example.com',
          display_name: 'Real User',
          roles: ['admin'],
          mfa_enabled: true,
          last_login: new Date().toISOString(),
          sessions: [],
        },
        status: 200,
        correlation_id: 'cor-profile',
        timestamp: new Date().toISOString(),
      });

      await act(async () => {
        await useAuthStore.getState().setSession(tokens);
      });

      expect(useAuthStore.getState().token).toBe('test-access-token');
      expect(useAuthStore.getState().refreshToken).toBe('test-refresh-token');
      expect(useAuthStore.getState().user?.email).toBe('user@example.com');
      expect(useAuthStore.getState().user?.roles).toContain('admin');
    });

    it('should keep session even if profile fails', async () => {
      const tokens = createAuthToken();

      mockApi.get.mockRejectedValueOnce(new Error('Profile unavailable'));

      await act(async () => {
        await useAuthStore.getState().setSession(tokens);
      });

      expect(useAuthStore.getState().token).toBe('test-access-token');
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe('hydrateAuth', () => {
    it('should return false if no token', async () => {
      const result = await hydrateAuth();
      expect(result).toBe(false);
    });

    it('should return true if session valid', async () => {
      useAuthStore.setState({ token: 'existing-token' });

      mockApi.get.mockResolvedValueOnce({
        data: {
          user_id: 'u1',
          email: 'test@example.com',
          display_name: 'User',
          roles: [],
          mfa_enabled: false,
          last_login: '',
          sessions: [],
        },
        status: 200,
        correlation_id: 'cor-hydrate',
        timestamp: new Date().toISOString(),
      });

      const result = await hydrateAuth();
      expect(result).toBe(true);
    });

    it('should clear session and return false if invalid', async () => {
      useAuthStore.setState({ token: 'expired-token' });

      mockApi.get.mockRejectedValueOnce(new Error('Unauthorized'));

      const result = await hydrateAuth();
      expect(result).toBe(false);
      expect(useAuthStore.getState().token).toBeNull();
    });
  });
});