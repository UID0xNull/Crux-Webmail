// ============================================================================
// Crux-Webmail Server — Barrel Exports
// ============================================================================
// Centraliza los exports del servidor para importar limpio desde @server.
// ============================================================================

export { createApp } from './app';

// Config
export { config, getConfig, getDbConfig, getRedisConfig, getImapBridgeConfig, getSmtpBridgeConfig, getAmavisBridgeConfig, getClamavBridgeConfig } from './config/app.config';

// Middleware
export { securityHeadersPlugin } from './middleware/security-headers';
export { rateLimiterPlugin } from './middleware/rate-limiter';
export { authMiddleware } from './middleware/auth';

// Routes
export { registerAuthRoutes } from './routes/auth.routes';
export { registerMailRoutes } from './routes/mail.routes';

// Modules
export { getSmtpBridge } from './modules/mail/smtp-bridge';
export { getImapBridgePool } from './modules/mail/imap-bridge';
export { SecureSessionManager, getSessionManager } from './modules/auth/session-manager';

// Utils
export { auditLogger } from './utils/audit-logger';
export { globalErrorHandler, errorHandler, CruxError, createAuthError, createBridgeError, createValidationError, createRateLimitError } from './errors/handler';

// Connections
export { getRedis, getSequelize, checkConnections, closeConnections } from './utils/connections';

// Crypto
export {
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
} from './utils/crypto';