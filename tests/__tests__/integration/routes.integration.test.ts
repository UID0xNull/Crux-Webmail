import Fastify from 'fastify';
import { registerAuthRoutes } from '../../../src/server/routes/auth';
import { registerMailRoutes } from '../../../src/server/routes/mail';
import { registerHealthRoutes } from '../../../src/server/routes/health';
import { securityHeadersPlugin } from '../../../src/server/middleware/security-headers';
import { rateLimitMiddleware } from '../../../src/server/middleware/rate-limiter';

jest.mock('../../../src/server/utils/connections', () => ({
  getRedis: () => ({
    ping: () => Promise.resolve('PONG'),
    connect: () => Promise.resolve(this),
    set: () => Promise.resolve('OK'),
    get: () => Promise.resolve(null),
    del: () => Promise.resolve(0),
    incr: () => Promise.resolve(1),
    expire: () => Promise.resolve(1),
    sadd: () => Promise.resolve(1),
    smembers: () => Promise.resolve([]),
    quit: () => Promise.resolve(),
    reset: () => {},
  }),
}));

jest.mock('../../../src/server/utils/audit-logger', () => ({
  auditLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), critical: jest.fn() },
}));

jest.mock('jsonwebtoken', () => ({
  sign: (p: any) => 'jwt_mock_' + p.sub + '_' + p.jti,
  verify: () => ({ sub: 'test-user', jti: 'test-jti', exp: Date.now()/1000 + 600, fingerprint: 'fp' }),
}));

describe('API Routes Integration', () => {
  let app: Fastify.FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(securityHeadersPlugin);
    await app.register(rateLimitMiddleware);
    await registerAuthRoutes(app);
    await registerMailRoutes(app);
    await registerHealthRoutes(app);
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  describe('Health endpoints', () => {
    it('GET /health returns 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
    });

    it('GET /health/ready returns 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Security headers on all routes', () => {
    it('every response includes CSP', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('API routes include no-cache', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} });
      expect(res.headers['cache-control']).toContain('no-store');
    });
  });

  describe('Auth route validation', () => {
    it('POST /api/auth/login rejects missing body fields', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/auth/login rejects short password', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/auth/login',
        payload: { username: 'test', password: 'x', client_fingerprint: 'fp', ip: '1.2.3.4', cert_serial: 'aabbccddee112233' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Correlation ID in responses', () => {
    it('successful responses include correlation_id', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(res.body);
      expect(body.correlation_id).toBeDefined();
      expect(typeof body.correlation_id).toBe('string');
    });

    it('error responses include correlation_id', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} });
      const body = JSON.parse(res.body);
      expect(body.correlation_id).toBeDefined();
    });
  });
});