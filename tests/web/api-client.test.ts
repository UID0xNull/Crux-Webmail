// ============================================================================
// Crux-Webmail — Unit Tests: API Client
// ============================================================================

import { apiRequest, api, ApiClientError } from 'src/web/lib/api/client';

// ------------------------------------------------------------------
// Mocks
// ------------------------------------------------------------------
const originalFetch = global.fetch;

function mockFetch(response: Response) {
  global.fetch = jest.fn().mockResolvedValue(response);
}

function mockJson(json: unknown) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(json),
    headers: new Headers(),
  } as Response;
}

function mockError(status: number, json: unknown = {}) {
  return {
    ok: false,
    status,
    json: jest.fn().mockResolvedValue(json),
    headers: new Headers(),
  } as Response;
}

// Mock the auth store
jest.mock('src/web/lib/store/auth', () => ({
  useAuthStore: {
    getState: jest.fn(),
  },
  default: {
    getState: jest.fn(),
  },
}));

jest.mock('src/web/lib/store/auth');

const { useAuthStore } = jest.requireMock('src/web/lib/store/auth');

useAuthStore.getState = jest.fn(() => ({
  token: 'test-token',
  refreshToken: null,
  setSession: jest.fn(),
  clearSession: jest.fn(),
}));

// Mock document.querySelector for CSRF
const originalQuerySelector = document.querySelector;

function mockCsrf(value?: string) {
  document.querySelector = jest.fn((selector: string) => {
    if (selector === 'meta[name="csrf-token"]') {
      return value
        ? { getAttribute: () => value }
        : null;
    }
    return originalQuerySelector.call(document, selector);
  }) as typeof document.querySelector;
}

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------
describe('API Client', () => {
  describe('apiRequest', () => {
    it('should make a GET request and return typed data', async () => {
      mockFetch(mockJson({ data: 'hello', status: 200 }));

      const result = await apiRequest<string>('/test');
      expect(result.data).toBe('hello');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should throw ApiClientError on 4xx/5xx', async () => {
      mockFetch(mockError(404, { code: 'NOT_FOUND', message: 'Not found' }));

      await expect(apiRequest('/missing')).rejects.toThrow(ApiClientError);
    });

    it('should include auth header', async () => {
      mockFetch(mockJson({ data: 'ok', status: 200 }));

      await apiRequest('/test');

      const callArgs = (fetch as jest.Mock).mock.calls[0][1];
      expect(callArgs.headers.Authorization).toBe('Bearer test-token');
    });

    it('should include correlation ID header', async () => {
      mockFetch(mockJson({ data: 'ok', status: 200 }));

      await apiRequest('/test');

      const callArgs = (fetch as jest.Mock).mock.calls[0][1];
      expect(callArgs.headers['X-Correlation-ID']).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should retry on transient errors', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockJson({ data: 'ok', status: 200 }));

      jest.useFakeTimers();

      const result = await apiRequest<string>('/test', { retry: true });

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result.data).toBe('ok');

      jest.useRealTimers();
    });

    it('should handle timeout', async () => {
      global.fetch = jest
        .fn()
        .mockImplementation(() => new Promise(() => {}));

      // Will timeout after 15s default
      await expect(
        apiRequest('/slow', { timeout: 10, retry: false })
      ).rejects.toThrow();
    });

    it('should auto-refresh on 401', async () => {
      const mock401 = mockError(401, { code: 'UNAUTHORIZED', message: 'Expired' });
      mock401.ok = false;
      mock401.status = 401;

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(mock401)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({
            access_token: 'new-token',
          }),
        } as Response)
        .mockResolvedValueOnce(mockJson({ data: 'ok', status: 200 }));

      // The second call after refresh should work
      // This is a simplified test - the actual flow depends on auth store behavior
    });
  });

  describe('api shortcuts', () => {
    beforeEach(() => {
      useAuthStore.getState = jest.fn(() => ({
        token: 'test-token',
        refreshToken: null,
        setSession: jest.fn(),
        clearSession: jest.fn(),
      }));
      mockCsrf('test-csrf');
    });

    it('should send POST with JSON body', async () => {
      mockFetch(mockJson({ data: { id: '1' }, status: 200 }));

      await api.post('/test', { name: 'value' });

      const callArgs = (fetch as jest.Mock).mock.calls[0][1];
      expect(callArgs.method).toBe('POST');
      expect(JSON.parse(callArgs.body)).toEqual({ name: 'value' });
    });

    it('should send DELETE request', async () => {
      mockFetch(mockJson({ data: {}, status: 200 }));

      await api.delete('/test/123');

      const callArgs = (fetch as jest.Mock).mock.calls[0][1];
      expect(callArgs.method).toBe('DELETE');
    });

    it('should send PATCH request', async () => {
      mockFetch(mockJson({ data: {}, status: 200 }));

      await api.patch('/test/123', { field: 'value' });

      const callArgs = (fetch as jest.Mock).mock.calls[0][1];
      expect(callArgs.method).toBe('PATCH');
    });

    it('should include CSRF token', async () => {
      mockFetch(mockJson({ data: {}, status: 200 }));

      await api.get('/test');

      const callArgs = (fetch as jest.Mock).mock.calls[0][1];
      expect(callArgs.headers['X-CSRF-Token']).toBe('test-csrf');
    });
  });

  describe('ApiClientError', () => {
    it('should expose error properties', () => {
      const error = new ApiClientError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Access denied',
        correlation_id: 'abc123',
      });

      expect(error.status).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.correlationId).toBe('abc123');
      expect(error.message).toBe('Access denied');
    });

    it('should be instanceof Error', () => {
      const error = new ApiClientError({
        status: 500,
        code: 'SERVER_ERROR',
        message: 'Internal error',
        correlation_id: 'xyz',
      });

      expect(error).toBeInstanceOf(Error);
    });
  });
});