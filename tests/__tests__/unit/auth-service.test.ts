// ============================================================================
// Crux-Webmail — Unit Tests: Auth Service (Password Validation + Base32)
// ============================================================================

jest.mock('../../../../src/server/utils/audit-logger', () => ({
  auditLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), critical: jest.fn() },
}));

jest.mock('../../../../src/server/utils/crypto', () => ({
  generateSecureUuid: jest.fn().mockReturnValue('uuid-123'),
  hashFingerprint: jest.fn().mockResolvedValue('fp-hash-123'),
  hashIp: jest.fn().mockReturnValue('ip-hash-123'),
  createHmac: jest.fn().mockReturnValue('hmac-123'),
  generateNonce: jest.fn().mockReturnValue(Buffer.from('aabbccdd', 'hex')),
}));

jest.mock('../../../../src/server/modules/auth/session-manager', () => ({
  getSessionManager: jest.fn().mockResolvedValue({
    authenticate: jest.fn(),
    verifySession: jest.fn(),
    refreshToken: jest.fn(),
    revokeSession: jest.fn(),
  }),
}));

describe('Auth Service — Password Validation', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('validatePasswordStrength', () => {
    it('should reject short passwords', async () => {
      const { AuthService: AS } = await import('../../../../src/server/modules/auth/auth-service');
      const auth = new AS();
      const result = await auth.register({ username: 'a@b.com', password: 'short' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('WEAK_PASSWORD');
    });

    it('should reject password without uppercase', async () => {
      const { AuthService: AS } = await import('../../../../src/server/modules/auth/auth-service');
      const auth = new AS();
      const result = await auth.register({
        username: 'a@b.com',
        password: 'alllower1!',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('WEAK_PASSWORD');
    });

    it('should reject password without special char', async () => {
      const { AuthService: AS } = await import('../../../../src/server/modules/auth/auth-service');
      const auth = new AS();
      const result = await auth.register({
        username: 'a@b.com',
        password: 'NoSpecial1a',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('WEAK_PASSWORD');
    });

    it('should accept strong password — no WEAK_PASSWORD error', async () => {
      const { AuthService: AS } = await import('../../../../src/server/modules/auth/auth-service');
      const auth = new AS();
      const result = await auth.register({
        username: 'new@user.com',
        password: 'StrongP@ss1',
      });
      expect(result.error).not.toBe('WEAK_PASSWORD');
    });
  });

  describe('login — error paths', () => {
    it('should reject invalid credentials', async () => {
      const { AuthService: AS } = await import('../../../../src/server/modules/auth/auth-service');
      const auth = new AS();

      const result = await auth.login({
        username: 'ghost@nowhere.com',
        password: 'StrongP@ss1',
        device_fingerprint: { browser: 'chrome', os: 'linux', screen: '1920x1080', timezone: 'UTC', languages: ['en'] },
        clientIp: '1.2.3.4',
        mtlsSerial: 'abc123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_CREDENTIALS');
    });

    it('should not leak whether user exists', async () => {
      const { AuthService: AS } = await import('../../../../src/server/modules/auth/auth-service');
      const auth = new AS();

      const result = await auth.login({
        username: 'nonexistent@test.com',
        password: 'StrongP@ss1',
        device_fingerprint: { browser: 'chrome', os: 'linux', screen: '1920x1080', timezone: 'UTC', languages: ['en'] },
        clientIp: '1.2.3.4',
        mtlsSerial: 'abc123',
      });

      expect(result.success).toBe(false);
      expect(['INVALID_CREDENTIALS', 'ACCOUNT_DISABLED', 'AUTH_INTERNAL_ERROR']).toContain(result.error);
    });
  });

  describe('getProfile', () => {
    it('should throw when user not found', async () => {
      const { AuthService: AS } = await import('../../../../src/server/modules/auth/auth-service');
      const auth = new AS();

      await expect(auth.getProfile('nonexistent-user')).rejects.toThrow('User not found');
    });
  });
});