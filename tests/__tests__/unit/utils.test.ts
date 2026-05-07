// ============================================================================
// Crux-Webmail — Unit Tests: Utils (Audit Logger, Crypto, Error Handler)
// ============================================================================

describe('Audit Logger', () => {
  let auditLogger: any;

  beforeEach(() => {
    jest.resetModules();
    auditLogger = require('../../../src/server/utils/audit-logger').auditLogger;
  });

  it('should expose all log levels', () => {
    expect(typeof auditLogger.info).toBe('function');
    expect(typeof auditLogger.warn).toBe('function');
    expect(typeof auditLogger.error).toBe('function');
    expect(typeof auditLogger.critical).toBe('function');
  });

  it('should accept context objects', () => {
    expect(() => {
      auditLogger.info('test message', { actor_id: 'test' });
    }).not.toThrow();
  });

  it('should handle empty messages gracefully', () => {
    expect(() => {
      auditLogger.warn('');
    }).not.toThrow();
  });
});

describe('CruxError', () => {
  let CruxError: any;

  beforeEach(() => {
    jest.resetModules();
    CruxError = require('../../../src/server/errors/handler').CruxError;
  });

  it('should set code and message', () => {
    const err = new CruxError('TEST_CODE', 'Test message');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('Test message');
    expect(err).toBeInstanceOf(Error);
  });

  it('should include optional details', () => {
    const details = { uid: 42, folder: 'INBOX' };
    const err = new CruxError('DETAILS_TEST', 'Detail test', { details });
    expect(err.details).toEqual({ details });
  });

  it('should work as instance of Error for throw/catch', () => {
    try {
      throw new CruxError('THROW_TEST', 'Should be caught');
    } catch (err: any) {
      expect(err.code).toBe('THROW_TEST');
      expect(err instanceof Error).toBe(true);
    }
  });
});

describe('Error Helpers', () => {
  it('should export error codes', () => {
    const errorHandler = require('../../../src/server/errors/handler');
    expect(typeof errorHandler.CruxError).toBe('function');
  });
});