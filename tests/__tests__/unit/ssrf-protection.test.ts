// ============================================================================
// Crux-Webmail — Unit Tests: SSRF Protection
// ============================================================================

import {
  validateAgainstSsrf,
  sanitizeUrl,
  validateAttachment,
  SAFE_MIME_TYPES,
  DANGEROUS_EXTENSIONS,
} from '../../../src/server/utils/ssrf-protection';

// Mock dns.lookup para evitar resolución real en tests
jest.mock('node:dns', () => ({
  lookup: jest.fn((hostname, opts, callback) => {
    if (typeof opts === 'function') {
      callback = opts;
      opts = undefined;
    }
    if (hostname === 'evil-internal.com') {
      if (typeof callback === 'function') {
        callback(null, [{ address: '192.168.1.100', family: 4 }], 4);
      }
    } else if (hostname === 'safe-external.com') {
      if (typeof callback === 'function') {
        callback(null, [{ address: '8.8.8.8', family: 4 }], 4);
      }
    } else if (hostname === 'ipv6-host.com') {
      if (typeof callback === 'function') {
        callback(null, [{ address: '2001:db8::1', family: 6 }], 6);
      }
    } else {
      if (typeof callback === 'function') {
        callback(new Error('DNS failed'), undefined, undefined);
      }
    }
  }),
}));

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn((hostname: string, opts: any) => {
    if (hostname === 'evil-internal.com') {
      return [{ address: '192.168.1.100', family: 4 }];
    } else if (hostname === 'safe-external.com') {
      return [{ address: '8.8.8.8', family: 4 }];
    } else if (hostname === 'ipv6-host.com') {
      return [{ address: '2001:db8::1', family: 6 }];
    }
    return Promise.reject(new Error('DNS failed'));
  }),
}));

describe('SSRF Protection', () => {
  describe('validateAgainstSsrf', () => {
    it('should reject private IP ranges', async () => {
      const result = await validateAgainstSsrf('evil-internal.com');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('private/reserved');
    });

    it('should allow safe external hosts', async () => {
      const result = await validateAgainstSsrf('safe-external.com');
      expect(result.safe).toBe(true);
    });

    it('should reject invalid URLs', async () => {
      const result = await validateAgainstSsrf('://not-a-url');
      expect(result.safe).toBe(false);
    });

    it('should reject hosts that fail DNS resolution', async () => {
      const result = await validateAgainstSsrf('nonexistent-host-12345.com');
      expect(result.safe).toBe(false);
    });
  });

  describe('sanitizeUrl', () => {
    it('should preserve allowed schemes', () => {
      expect(sanitizeUrl('https://example.com/path', ['http', 'https']))
        .toBe('https://example.com/path');
    });

    it('should reject dangerous schemes', () => {
      expect(sanitizeUrl('javascript:alert(1)', ['http', 'https'])).toBe('');
    });

    it('should reject malformed URLs', () => {
      expect(sanitizeUrl('://not-url')).toBe('');
    });

    it('should allow mailto and tel when specified', () => {
      expect(sanitizeUrl('mailto:test@example.com', ['mailto']))
        .toContain('mailto:');
    });
  });

  describe('validateAttachment', () => {
    it('should allow safe MIME types', () => {
      expect(validateAttachment('application/pdf', 'doc.pdf', 1024).valid).toBe(true);
      expect(validateAttachment('image/jpeg', 'photo.jpg', 2048).valid).toBe(true);
    });

    it('should reject dangerous extensions', () => {
      expect(validateAttachment('application/octet-stream', 'malware.exe', 100).valid).toBe(false);
      expect(validateAttachment('application/octet-stream', 'hack.bat', 100).valid).toBe(false);
    });

    it('should reject oversized files', () => {
      const result = validateAttachment('application/zip', 'big.zip', 60 * 1024 * 1024);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds');
    });

    it('should reject empty files', () => {
      const result = validateAttachment('text/plain', 'empty.txt', 0);
      expect(result.valid).toBe(false);
    });

    it('should reject path traversal', () => {
      expect(validateAttachment('text/plain', '../etc/passwd', 100).valid).toBe(false);
    });
  });
});