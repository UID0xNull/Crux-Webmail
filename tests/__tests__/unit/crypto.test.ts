// ============================================================================
// Crux-Webmail — Unit Tests: Crypto Utilities
// ============================================================================

import {
  generateNonce,
  generateSecureUuid,
  hashFingerprint,
  hashIp,
  AeadCrypto,
  createHmac,
  verifyHmac,
  deriveKey,
  generateSalt,
  isValidCertSerial,
  getExpiryTimestamp,
  isExpired,
} from '../../../src/server/utils/crypto';

describe('Crypto Utilities', () => {
  describe('generateNonce', () => {
    it('should generate a hex string of expected length', () => {
      const nonce = generateNonce(32);
      expect(nonce).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(nonce)).toBe(true);
    });

    it('should generate unique nonces each call', () => {
      const n1 = generateNonce();
      const n2 = generateNonce();
      expect(n1).not.toBe(n2);
    });

    it('should respect custom length', () => {
      const nonce = generateNonce(16);
      expect(nonce).toHaveLength(32);
    });
  });

  describe('generateSecureUuid', () => {
    it('should return a valid UUID v4 format', () => {
      const uuid = generateSecureUuid();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('should generate unique UUIDs', () => {
      const u1 = generateSecureUuid();
      const u2 = generateSecureUuid();
      expect(u1).not.toBe(u2);
    });
  });

  describe('hashFingerprint', () => {
    it('should produce consistent hashes for same input', () => {
      const fp = 'Mozilla/5.0|Windows|1920x1080|UTC';
      const h1 = hashFingerprint(fp);
      const h2 = hashFingerprint(fp);
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(64); // SHA-256 hex
    });

    it('should produce different hashes for different input', () => {
      const h1 = hashFingerprint('browser-a');
      const h2 = hashFingerprint('browser-b');
      expect(h1).not.toBe(h2);
    });
  });

  describe('hashIp', () => {
    it('should hash IP with salt deterministically', () => {
      const h1 = hashIp('192.168.1.1', 'salt');
      const h2 = hashIp('192.168.1.1', 'salt');
      expect(h1).toBe(h2);
      expect(h1).toHaveLength(16);
    });

    it('should produce different hashes with different salts', () => {
      const h1 = hashIp('192.168.1.1', 'salt-a');
      const h2 = hashIp('192.168.1.1', 'salt-b');
      expect(h1).not.toBe(h2);
    });

    it('should produce different hashes for different IPs', () => {
      const h1 = hashIp('192.168.1.1', 'salt');
      const h2 = hashIp('10.0.0.1', 'salt');
      expect(h1).not.toBe(h2);
    });
  });

  describe('AeadCrypto', () => {
    const secret = 'test-encryption-key-that-is-at-least-32-bytes-long!';
    let aead: AeadCrypto;

    beforeEach(() => {
      aead = new AeadCrypto(secret);
    });

    it('should encrypt and decrypt data symmetrically', () => {
      const plaintext = '{"userId":"test","session":"abc123"}';
      const encrypted = aead.encrypt(plaintext);
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('ciphertext');
      const decrypted = aead.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const ct = 'test data';
      const e1 = aead.encrypt(ct);
      const e2 = aead.encrypt(ct);
      expect(e1.ciphertext).not.toBe(e2.ciphertext);
      expect(e1.iv).not.toBe(e2.iv);
    });

    it('should throw on key too short', () => {
      expect(() => new AeadCrypto('short')).toThrow('Encryption key must be at least 32 bytes');
    });

    it('should reject tampered ciphertext', () => {
      const encrypted = aead.encrypt('test');
      const tampered = { ...encrypted, tag: '0000' };
      expect(() => aead.decrypt(tampered)).toThrow();
    });
  });

  describe('HMAC', () => {
    const secret = 'hmac-secret-key';

    it('should create and verify HMAC', () => {
      const msg = 'hello-world';
      const hmac = createHmac(msg, secret);
      expect(hmac).toHaveLength(64);
      expect(verifyHmac(msg, hmac, secret)).toBe(true);
    });

    it('should reject wrong message', () => {
      const hmac = createHmac('msg-1', secret);
      expect(verifyHmac('msg-2', hmac, secret)).toBe(false);
    });

    it('should reject wrong secret', () => {
      const hmac = createHmac('msg', secret);
      expect(verifyHmac('msg', hmac, 'other-secret')).toBe(false);
    });
  });

  describe('deriveKey', () => {
    it('should derive a 32-byte key', async () => {
      const key = await deriveKey('password', 'salt');
      expect(key.length).toBe(32);
    });

    it('should be deterministic with same inputs', async () => {
      const k1 = await deriveKey('pass', 'salt');
      const k2 = await deriveKey('pass', 'salt');
      expect(k1).toEqual(k2);
    });
  });

  describe('generateSalt', () => {
    it('should produce 32-char hex string', () => {
      const salt = generateSalt();
      expect(salt).toHaveLength(32);
      expect(/^[a-f0-9]+$/.test(salt)).toBe(true);
    });
  });

  describe('isValidCertSerial', () => {
    it('should accept valid hex serials of 16+ chars', () => {
      expect(isValidCertSerial('aabbccddee112233')).toBe(true);
      expect(isValidCertSerial('AABBCCDDEE1122334455667788990011')).toBe(true);
    });

    it('should reject short serials', () => {
      expect(isValidCertSerial('aabbccdd')).toBe(false);
    });

    it('should reject non-hex characters', () => {
      expect(isValidCertSerial('aabbccddzz112233')).toBe(false);
    });
  });

  describe('Timestamp utilities', () => {
    it('getExpiryTimestamp should be in the future', () => {
      const exp = getExpiryTimestamp(5000);
      expect(exp).toBeGreaterThan(Date.now());
      expect(exp - Date.now()).toBeLessThanOrEqual(5100);
    });

    it('isExpired should detect expired timestamps', () => {
      expect(isExpired(Date.now() - 1000)).toBe(true);
      expect(isExpired(Date.now() + 10000)).toBe(false);
    });
  });
});