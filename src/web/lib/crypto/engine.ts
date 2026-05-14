// ============================================================================
// Crux-Webmail Frontend — E2E Crypto Engine (WebCrypto)
// Browser-side AES-256-GCM + ChaCha20 via Web Crypto API
// ============================================================================

import type { E2EEncryptedMessage, E2EKeyPair } from '../types';

// ------------------------------------------------------------------
// Key Management
// ------------------------------------------------------------------

export class CryptoKeyManager {
  private static readonly ALGO = 'AES-GCM';
  private static readonly BIT_LENGTH = 256;
  private static readonly KDF_SALT_KEY = 'crux-e2e-kdf-salt';

  /**
   * Generate a new AES-256-GCM key pair (symmetric key + public export)
   */
  static async generateSessionKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
      { name: this.ALGO, length: this.BIT_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Export key as base64 for transmission
   */
  static async exportKey(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(raw)));
  }

  /**
   * Import key from base64
   */
  static async importKey(b64Key: string): Promise<CryptoKey> {
    const bytes = Uint8Array.from(atob(b64Key), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', bytes, this.ALGO, true, ['encrypt', 'decrypt']);
  }

  /**
   * Derive an encryption key from a password + salt using PBKDF2
   */
  static async deriveKeyFromPassword(
    password: string,
    salt: string
  ): Promise<CryptoKey> {
    const enc = new TextEncoder();

    const baseKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const saltBuffer = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100_000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Store key reference in IndexedDB (never store raw key)
   */
  static async storeKeyReference(
    userId: string,
    keyPair: E2EKeyPair
  ): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction('keyPairs', 'readwrite');
    const store = tx.objectStore('keyPairs');
    store.put({ userId, ...keyPair });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Load key reference from IndexedDB
   */
  static async loadKeyReference(userId: string): Promise<E2EKeyPair | null> {
    const db = await this.openDb();
    const tx = db.transaction('keyPairs', 'readonly');
    const store = tx.objectStore('keyPairs');
    const request = store.get(userId);
    return new Promise((resolve) => {
      request.onsuccess = () => resolve((request.result as E2EKeyPair) ?? null);
      request.onerror = () => resolve(null);
    });
  }

  private static openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('crux-e2e-keys', 1);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('keyPairs')) {
          db.createObjectStore('keyPairs', { keyPath: 'userId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// ------------------------------------------------------------------
// Encrypt / Decrypt
// ------------------------------------------------------------------

export class E2EEngine {
  /**
   * Encrypt plaintext to E2E format
   */
  static async encrypt(
    plaintext: string,
    key: CryptoKey
  ): Promise<E2EEncryptedMessage> {
    const enc = new TextEncoder();
    const data = enc.encode(plaintext);

    // Generate unique IV per encryption
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // AES-GCM embeds auth tag in ciphertext (last 16 bytes)
    const ctBytes = new Uint8Array(ciphertext);
    const tag = ctBytes.slice(-16);
    const ctWithoutTag = ctBytes.slice(0, -16);

    return {
      ciphertext: this.bytesToBase64(ctWithoutTag),
      iv: this.bytesToBase64(iv),
      tag: this.bytesToBase64(tag),
      sender_fingerprint: await this.getFingerprint(),
      algorithm: 'AES-256-GCM',
    };
  }

  /**
   * Decrypt E2E message back to plaintext
   */
  static async decrypt(
    msg: E2EEncryptedMessage,
    key: CryptoKey
  ): Promise<string> {
    // Reconstruct ciphertext + tag
    const ctBytes = this.base64ToBytes(msg.ciphertext);
    const tagBytes = this.base64ToBytes(msg.tag);
    const ivBytes = this.base64ToBytes(msg.iv);

    const combined = new Uint8Array(ctBytes.length + tagBytes.length);
    combined.set(ctBytes);
    combined.set(tagBytes, ctBytes.length);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes as BufferSource },
      key,
      combined as BufferSource
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Encrypt with shared key exchange (Diffie-Hellman style via WebCrypto)
   * Used for encrypting to a recipient's public key
   */
  static async encryptForRecipient(
    plaintext: string,
    recipientPublicKey: CryptoKey
  ): Promise<E2EEncryptedMessage> {
    // Generate ephemeral keypair
    const epPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    // Derive shared secret
    const sharedSecret = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: recipientPublicKey },
      epPair.privateKey,
      256
    );

    // Derive AES key from shared secret
    const aesKey = await crypto.subtle.importKey(
      'raw',
      sharedSecret,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    const encrypted = await this.encrypt(plaintext, aesKey);
    // Include ephemeral public key in metadata for the recipient to derive
    encrypted.sender_fingerprint = btoa(
      JSON.stringify({
        fp: await this.getFingerprint(),
        eph: await this.exportPublicKey(epPair.publicKey),
      })
    );

    return encrypted;
  }

  /**
   * Generate a P-256 keypair for E2E identity
   */
  static async generateIdentityKeypair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
  }

  /**
   * Sign data with private key
   */
  static async signData(
    data: string,
    privateKey: CryptoKey
  ): Promise<string> {
    const enc = new TextEncoder();
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      privateKey,
      enc.encode(data)
    );
    return this.bytesToBase64(new Uint8Array(signature));
  }

  /**
   * Verify signature
   */
  static async verifySignature(
    data: string,
    signature: string,
    publicKey: CryptoKey
  ): Promise<boolean> {
    const enc = new TextEncoder();
    try {
      return crypto.subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        publicKey,
        this.base64ToBytes(signature) as BufferSource,
        enc.encode(data)
      );
    } catch {
      return false;
    }
  }

  /**
   * Generate browser fingerprint for Zero-Trust correlation
   */
  static async generateFingerprint(): Promise<string> {
    const components = [
      navigator.userAgent,
      navigator.language,
      (screen as any).resolutionMedia ?? window.devicePixelRatio?.toString() ?? '',
      screen.width.toString(),
      screen.height.toString(),
      new Date().getTimezoneOffset().toString(),
      navigator.hardwareConcurrency?.toString() ?? '',
      (navigator as any).deviceMemory?.toString() ?? '',
    ];

    const raw = components.join('|');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  private static getFingerprint(): Promise<string> {
    return this.generateFingerprint();
  }

  private static async exportPublicKey(
    key: CryptoKey
  ): Promise<string> {
    const spki = await crypto.subtle.exportKey('spki', key);
    return this.bytesToBase64(new Uint8Array(spki));
  }

  private static bytesToBase64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
  }

  private static base64ToBytes(b64: string): Uint8Array {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }
}

// ------------------------------------------------------------------
// PGP Wrapper (OpenPGP.js) — for S/MIME / PGP compatibility
// ------------------------------------------------------------------

export class PGPAdapter {
  /**
   * Generate OpenPGP key pair
   */
  static async generatePGPKey(userEmail: string, userName: string): Promise<{
    privateKey: string;
    publicKey: string;
    fingerprint: string;
  }> {
    const { generateKey } = await import('openpgp');

    const key = await generateKey({
      type: 'ecc',
      curve: 'curve25519Legacy',
      userIDs: [
        {
          name: userName,
          email: userEmail,
        },
      ],
    });

    const { readKey } = await import('openpgp');
    const parsedKey = await readKey({ armoredKey: key.publicKey });

    return {
      privateKey: key.privateKey,
      publicKey: key.publicKey,
      fingerprint: parsedKey.getFingerprint(),
    };
  }

  /**
   * Encrypt message with OpenPGP
   */
  static async encryptMessage(
    plaintext: string,
    recipientArmor: string
  ): Promise<string> {
    const { createMessage, encrypt } = await import('openpgp');

    // Parse recipient public keys
    const { readKey } = await import('openpgp');
    const recipientKey = await readKey({
      armoredKey: recipientArmor,
    });

    // Encrypt
    const message = await encrypt({
      message: await createMessage({ text: plaintext }),
      encryptionKeys: recipientKey,
    });

    return message.armoredMessage;
  }

  /**
   * Decrypt OpenPGP message
   */
  static async decryptMessage(
    encryptedArmor: string,
    privateKeyArmor: string,
    passphrase: string
  ): Promise<string> {
    const { readMessage, readPrivateKey, decryptKey, decrypt } = await import('openpgp');

    const message = await readMessage({
      armoredMessage: encryptedArmor,
    });

    let keys = await readPrivateKey({
      armoredKey: privateKeyArmor,
    });
    if (!keys.isDecrypted()) {
      keys = await decryptKey({
        privateKey: keys,
        passphrase,
      });
    }

    const { data: decrypted } = await decrypt({
      message,
      decryptionKeys: keys,
    });

    return decrypted;
  }
}
