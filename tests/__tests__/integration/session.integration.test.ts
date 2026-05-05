import { RedisMock } from '../../mocks/redis.mock';
import { SecureSessionManager } from '../../../src/server/modules/auth/session-manager';

jest.mock('../../../src/server/utils/connections', () => ({ getRedis: () => mockRedis }));
jest.mock('../../../src/server/utils/audit-logger', () => ({
  auditLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), critical: jest.fn() },
}));
jest.mock('jsonwebtoken', () => ({
  sign: (p: any) => 'jwt_' + p.sub + '_' + p.jti,
  verify: (t: string) => { const p = t.split('_'); return { sub: p[2], jti: p[3], exp: Date.now()/1000+300, fingerprint: 'fp' }; },
}));

const mockRedis = new RedisMock();
const testFp = { browser: 'chrome', os: 'linux', screen: '1920x1080', timezone: 'UTC', languages: ['en'], hash: 'h1' };

describe('SessionManager Integration', () => {
  let mgr: SecureSessionManager;
  beforeEach(async () => { mockRedis.reset(); mgr = new SecureSessionManager(); await mgr.init(); });
  afterEach(async () => { await mockRedis.quit(); });

  it('creates session and returns tokens', async () => {
    const r = await mgr.authenticate('test@example.com', 'pass1234', testFp, '192.168.1.1', 'aabbccddee112233');
    expect(r.success).toBe(true);
    expect(r.token).toBeDefined();
    expect(r.session_id).toBeDefined();
  });

  it('rejects short password', async () => {
    const r = await mgr.authenticate('test@example.com', 'x', testFp, '192.168.1.1', 'aabbccddee112233');
    expect(r.success).toBe(false);
  });

  it('stores session in Redis', async () => {
    const r = await mgr.authenticate('test@example.com', 'pass1234', testFp, '192.168.1.1', 'aabbccddee112233');
    if (r.session_id) { const stored = await mockRedis.get('session:' + r.session_id); expect(stored).not.toBeNull(); }
  });

  it('revokes session', async () => {
    const r = await mgr.authenticate('test@example.com', 'pass1234', testFp, '192.168.1.1', 'aabbccddee112233');
    if (r.session_id) { await mgr.revokeSession(r.session_id); const gone = await mockRedis.get('session:' + r.session_id); expect(gone).toBeNull(); }
  });

  it('revokes all user sessions', async () => {
    await mgr.authenticate('u@t.com', 'pass1234', testFp, '1.2.3.4', 'aabbccddee112233');
    await mgr.authenticate('u@t.com', 'pass1234', testFp, '5.6.7.8', 'ddeeff0011223344');
    const count = await mgr.revokeAllUserSessions('u@t.com');
    expect(count).toBe(2);
  });

  it('enforces max concurrent sessions (5)', async () => {
    const f2 = { ...testFp, browser: 'firefox', os: 'win', screen: '1366x768', hash: 'h2' };
    for (let i = 0; i < 5; i++) { await mgr.authenticate('lim@t.com', 'pass1234', testFp, '10.0.0.' + i, 'sess' + i); }
    const over = await mgr.authenticate('lim@t.com', 'pass1234', f2, '10.0.0.99', 'sess99');
    expect(over.success).toBe(false);
  });
});