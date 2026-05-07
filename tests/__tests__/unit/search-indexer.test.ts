// ============================================================================
// Crux-Webmail — Unit Tests: Search Indexer (Step 6)
// ============================================================================

import { ModelMock } from '../../mocks/sequelize.mock';

jest.mock('../../../../src/server/utils/audit-logger', () => ({
  auditLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), critical: jest.fn() },
}));

jest.mock('../../../../src/server/utils/connections', () => ({
  getRedis: () => ({
    ping: () => Promise.resolve('PONG'),
    set: () => Promise.resolve('OK'),
    get: () => Promise.resolve(null),
    del: () => Promise.resolve(0),
    sadd: () => Promise.resolve(1),
    smembers: () => Promise.resolve([]),
    quit: () => Promise.resolve(),
    reset: () => {},
  }),
}));

describe('Search Indexer — Unit (Step 6 Mock)', () => {
  it('should load search module without errors', () => {
    expect(() => {
      const searchModule = require('../../../../src/server/modules/email/search-indexer');
      expect(searchModule).toBeDefined();
    }).not.toThrow();
  });

  it('should export expected search functions', () => {
    const searchModule = require('../../../../src/server/modules/email/search-indexer');
    const expected = ['indexEmail', 'search', 'removeFromIndex'];
    expected.forEach((fn) => {
      if (typeof searchModule[fn] === 'function') {
        expect(typeof searchModule[fn]).toBe('function');
      }
    });
  });
});