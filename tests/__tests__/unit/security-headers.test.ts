// ============================================================================
// Crux-Webmail — Unit Tests: Security Headers
// ============================================================================

import Fastify from 'fastify';
import { securityHeadersPlugin } from '../../../src/server/middleware/security-headers';

describe('Security Headers Middleware', () => {
  let app: Fastify.FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(securityHeadersPlugin);

    app.get('/test', async () => ({ message: 'hello' }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should set strict CSP', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });
    const csp = response.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('should set HSTS with preload', async () => {
    const response = await app.inject({ method: 'GET', url: '/test' });
    const hsts = response.headers['strict-transport-security'];
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  it('should set COOP and COEP for cross-origin isolation', async () => {
    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(response.headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it('should set X-Frame-Options DENY', async () => {
    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  it('should set X-Content-Type-Options nosniff', async () => {
    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should set Permissions-Policy restricting dangerous features', async () => {
    const response = await app.inject({ method: 'GET', url: '/test' });
    const pp = response.headers['permissions-policy'];
    expect(pp).toContain('camera=()');
    expect(pp).toContain('microphone=()');
    expect(pp).toContain('geolocation=()');
    expect(pp).toContain('payment=()');
  });

  it('should set no-cache headers for API routes', async () => {
    app.get('/api/test', async () => ({ data: 'test' }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/test' });
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['cache-control']).toContain('no-cache');
  });

  it('should not leak server version info', async () => {
    const response = await app.inject({ method: 'GET', url: '/test' });
    const server = response.headers['server'];
    expect(server).toBeDefined();
    expect(server).not.toContain('fastify');
  });
});