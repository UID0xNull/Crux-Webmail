// ============================================================================
// Crux-Webmail — Unit Tests: Error Handler
// ============================================================================

import {
  CruxError,
  createAuthError,
  createBridgeError,
  createValidationError,
  createRateLimitError,
  globalErrorHandler,
} from '../../../src/server/errors/handler';

describe('Error Handler', () => {
  describe('CruxError', () => {
    it('should create error with correct properties', () => {
      const err = new CruxError('AUTH_FAILED', 'Invalid credentials');
      expect(err.name).toBe('CruxError');
      expect(err.code).toBe('AUTH_FAILED');
      expect(err.message).toBe('Invalid credentials');
      expect(typeof err.correlationId).toBe('string');
    });

    it('should accept details and original error', () => {
      const original = new Error('upstream failed');
      const err = new CruxError('BRIDGE_ERROR', 'bridge down', {
        details: { host: 'localhost' },
        originalError: original,
      });
      expect(err.details).toEqual({ host: 'localhost' });
      expect(err.originalError).toBe(original);
    });
  });

  describe('Factory Functions', () => {
    it('createAuthError should produce AUTH_FAILED code', () => {
      const err = createAuthError('bad login');
      expect(err.code).toBe('AUTH_FAILED');
    });

    it('createBridgeError should produce BRIDGE_CONNECTION_FAILED', () => {
      const err = createBridgeError('imap', 'timeout');
      expect(err.code).toBe('BRIDGE_CONNECTION_FAILED');
    });

    it('createValidationError should produce INVALID_PAYLOAD', () => {
      const err = createValidationError('bad schema', { field: 'email' });
      expect(err.code).toBe('INVALID_PAYLOAD');
    });

    it('createRateLimitError should produce RATE_LIMIT_EXCEEDED', () => {
      const err = createRateLimitError();
      expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('globalErrorHandler', () => {
    let mockResponse: any;

    beforeEach(() => {
      mockResponse = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
    });

    it('should handle CruxError with mapped status codes', () => {
      const err = new CruxError('AUTH_FAILED', 'unauthorized');
      globalErrorHandler(err, mockResponse);
      expect(mockResponse.code).toHaveBeenCalledWith(401);
      const sent = mockResponse.send.mock.calls[0][0];
      expect(sent.status).toBe(401);
      expect(sent.code).toBe('AUTH_FAILED');
      expect(sent.correlation_id).toBeDefined();
    });

    it('should handle BRIDGE_CONNECTION_FAILED as 503', () => {
      const err = new CruxError('BRIDGE_CONNECTION_FAILED', 'smtp down');
      globalErrorHandler(err, mockResponse);
      expect(mockResponse.code).toHaveBeenCalledWith(503);
    });

    it('should handle UPLOAD_TOO_LARGE as 413', () => {
      const err = new CruxError('UPLOAD_TOO_LARGE', 'file too big');
      globalErrorHandler(err, mockResponse);
      expect(mockResponse.code).toHaveBeenCalledWith(413);
    });

    it('should sanitize stack in production mode', () => {
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const err = new Error('oops');
      globalErrorHandler(err, mockResponse);
      const sent = mockResponse.send.mock.calls[0][0];
      expect(sent.status).toBe(500);
      expect(sent.code).toBe('INTERNAL_ERROR');
      process.env.NODE_ENV = oldEnv;
    });

    it('should include correlation_id in all responses', () => {
      const err = new CruxError('INTERNAL_ERROR', 'crash');
      globalErrorHandler(err, mockResponse);
      const sent = mockResponse.send.mock.calls[0][0];
      expect(typeof sent.correlation_id).toBe('string');
      expect(sent.correlation_id.length).toBeGreaterThan(0);
    });
  });
});