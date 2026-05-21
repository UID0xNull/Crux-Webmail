// ============================================================================
// Crux-Webmail — Utilidades Criptográficas Seguras
// ============================================================================
// WebCrypto / Node Crypto para hash de fingerprints, derivación de claves,
// generación de nonces, y validación HMAC.
// ============================================================================

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const HASH_ALGO = 'sha256';
const STRETCH_ROUNDS = 100_000;

// ------------------------------------------------------------------
// Generación de nonce aleatorio (para JWT, session, CSRF)
// ------------------------------------------------------------------
export function generateNonce(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// ------------------------------------------------------------------
// Generación de UUID v4 criptográficamente seguro
// ------------------------------------------------------------------
export function generateSecureUuid(): string {
  const buf = crypto.randomBytes(16);
  buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
  buf[8] = (buf[8] & 0x3f) | 0x80; // variant 10
  const hex = buf.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}

// ------------------------------------------------------------------
// Hash de fingerprint de dispositivo (SHA-256)
// ------------------------------------------------------------------
export async function hashFingerprint(data: string): Promise<string> {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ------------------------------------------------------------------
// Hash de IP con salt rotativo (privacy-preserving)
// ------------------------------------------------------------------
export function hashIp(ip: string, salt: string): string {
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').substring(0, 16);
}

// ------------------------------------------------------------------
// Cifrado / Descifrado AEAD (AES-256-GCM) para session data
// ------------------------------------------------------------------
export class AeadCrypto {
  private key: crypto.KeyObject;

  constructor(keyMaterial: string | Buffer) {
    const key = Buffer.from(keyMaterial);
    if (key.length < 32) {
      throw new Error('Encryption key must be at least 32 bytes');
    }
    this.key = crypto.createSecretKey(key);
  }

  encrypt(plaintext: string): { iv: string; tag: string; ciphertext: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, this.key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return { iv: iv.toString('hex'), tag, ciphertext };
  }

  decrypt(params: { iv: string; tag: string; ciphertext: string }): string {
    const iv = Buffer.from(params.iv, 'hex');
    const tag = Buffer.from(params.tag, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(params.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

// ------------------------------------------------------------------
// HMAC para integridad de session tokens
// ------------------------------------------------------------------
export function createHmac(message: string, secret: string): string {
  return crypto.createHmac(HASH_ALGO, secret).update(message).digest('hex');
}

export function verifyHmac(message: string, hmac: string, secret: string): boolean {
  // Timing-safe comparison para prevenir timing attacks
  const expected = Buffer.from(createHmac(message, secret), 'hex');
  const received = Buffer.from(hmac, 'hex');
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

// ------------------------------------------------------------------
// Derivación de clave (PBKDF2 para storage encryption key)
// ------------------------------------------------------------------
export function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, STRETCH_ROUNDS, 32, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

// ------------------------------------------------------------------
// Generación de salt
// ------------------------------------------------------------------
export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

// ------------------------------------------------------------------
// Validación de certificado mTLS serial
// ------------------------------------------------------------------
export function isValidCertSerial(serial: string): boolean {
  // Formato esperado: hex string de 16+ chars
  return /^[a-fA-F0-9]{16,}$/.test(serial);
}

// ------------------------------------------------------------------
// Expiración: cálculo de timestamps seguros
// ------------------------------------------------------------------
export function getExpiryTimestamp(msFromNow: number): number {
  return Date.now() + msFromNow;
}

export function isExpired(expiresAt: number, leewayMs: number = 1000): boolean {
  return Date.now() > expiresAt + leewayMs;
}