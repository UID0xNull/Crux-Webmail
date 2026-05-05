// ============================================================================
// Crux-Webmail — Unit Tests: Audit Logger
// ============================================================================

import { AuditLogger } from '../../../src/server/utils/audit-logger';

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger({ source: 'test-suite', maxBuffer: 100 });
  });

  it('should log info events', () => {
    const event = logger.info('test info');
    expect(event.level).toBe('info');
    expect(event.message).toBe('test info');
    expect(event.source).toBe('test-suite');
    expect(event.event_id).toBeDefined();
    expect(event.timestamp).toBeDefined();
  });

  it('should log warn events', () => {
    const event = logger.warn('test warning');
    expect(event.level).toBe('warn');
  });

  it('should log error events', () => {
    const event = logger.error('test error');
    expect(event.level).toBe('error');
  });

  it('should log critical events', () => {
    const event = logger.critical('test critical');
    expect(event.level).toBe('critical');
  });

  it('should include metadata in events', () => {
    const event = logger.info('test', {
      actor_id: 'user-1',
      session_id: 'session-1',
      client_ip: '127.0.0.1',
      metadata: { action: 'login' },
    });
    expect(event.actor_id).toBe('user-1');
    expect(event.session_id).toBe('session-1');
    expect(event.client_ip).toBe('127.0.0.1');
    expect(event.metadata).toEqual({ action: 'login' });
  });

  it('should track events in buffer', () => {
    logger.info('event 1');
    logger.info('event 2');
    logger.info('event 3');
    const recent = logger.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].message).toBe('event 2');
    expect(recent[1].message).toBe('event 3');
  });

  it('flush should clear buffer', async () => {
    logger.info('before flush');
    await logger.flush();
    // flush clears internal buffer
    expect(logger.getRecent(0)).toHaveLength(0);
  });
});