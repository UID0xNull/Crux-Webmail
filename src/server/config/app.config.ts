// ============================================================================
// Crux-Webmail Backend — Configuración Centralizada
// ============================================================================
// Todas las variables pasan por validación estricta con Zod antes de uso.
// Soporta Docker secrets via *_FILE pattern (reads file content as value).
// No hay valores hardcodeados — todo desde .env o secrets vault.
// ============================================================================

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ------------------------------------------------------------------
// Docker Secrets Resolver — soporta *_FILE pattern
// Si VAR_FILE=/run/secrets/foo.txt → lee el archivo y usa su contenido como VAR
// ------------------------------------------------------------------
function resolveEnvWithFile(): Record<string, string | undefined> {
  const resolved = { ...process.env };

  for (const key of Object.keys(resolved)) {
    if (key.endsWith('_FILE') && resolved[key]) {
      const baseKey = key.replace(/_FILE$/, '');
      try {
        const fileContent = fs.readFileSync(resolved[key] as string, 'utf8').trim();
        if (!resolved[baseKey]) {
          resolved[baseKey] = fileContent;
        }
      } catch {
        // File no existe o no es legible — usar valor directo si existe
        if (resolved[baseKey]) {
          // Keep the direct value
        }
      }
    }
  }

  return resolved;
}

// ------------------------------------------------------------------
// Schema de Validación Estricto para Env Vars
// ------------------------------------------------------------------
const envSchema = z.object({
  // --- Server ---
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SERVER_HOST: z.string().default('0.0.0.0'),

  // --- JWT ---
  JWT_SECRET: z.string().min(64),
  JWT_REFRESH_SECRET: z.string().min(64),
  JWT_ACCESS_TTL_MS: z.coerce.number().int().positive().default(300000), // 5min
  JWT_REFRESH_TTL_MS: z.coerce.number().int().positive().default(86400000), // 24h
  JWT_ISSUER: z.string().default('crux-webmail-api'),
  JWT_AUDIENCE: z.string().default('crux-webmail-client'),
  // AEAD encryption key for sessions (at least 32 hex chars = 16 bytes)
  SESSION_ENCRYPTION_KEY: z.string().min(64),

  // --- Postgres ---
  POSTGRES_DB: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(8),
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  POSTGRES_SSL: z.boolean().default(false),

  // --- Redis ---
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().nullable().default(null),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),

  // --- Dovecot / IMAP ---
  DOVECOT_HOST: z.string().min(1).default('172.21.0.11'),
  DOVECOT_PORT: z.coerce.number().int().default(993),
  DOVECOT_LMTP_PORT: z.coerce.number().int().default(24),

  // --- Postfix ---
  POSTFIX_HOST: z.string().min(1).default('172.21.0.10'),
  POSTFIX_PORT: z.coerce.number().int().default(587),
  POSTFIX_DOMAIN: z.string().min(1).default('crux.local'),

  // --- Amavis ---
  AMAVIS_HOST: z.string().min(1).default('172.21.0.12'),
  AMAVIS_PORT: z.coerce.number().int().default(10024),
  AMAVIS_CONTROL_PORT: z.coerce.number().int().default(9998),

  // --- ClamAV ---
  CLAMAV_HOST: z.string().min(1).default('172.22.0.10'),
  CLAMAV_PORT: z.coerce.number().int().default(3310),

  // --- Rate Limiting ---
  RATE_LIMIT_API_RPM: z.coerce.number().int().positive().default(1800),
  RATE_LIMIT_AUTH_RPM: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_CONN_PER_IP: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // --- TLS / mTLS ---
  TLS_CERT_PATH: z.string().min(1).default('./certs/server.crt'),
  TLS_KEY_PATH: z.string().min(1).default('./certs/server.key'),
  TLS_CA_PATH: z.string().min(1).default('./certs/ca-chain.crt'),

  // --- Logging ---
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),

  // --- MinIO ---
  MINIO_HOST: z.string().min(1).default('172.22.0.12'),
  MINIO_PORT: z.coerce.number().int().default(9000),
  MINIO_ROOT_USER: z.string().min(1),
  MINIO_ROOT_PASSWORD: z.string().min(1),

  // --- Frontend / CORS ---
  FRONTEND_URL: z.string().default('http://localhost:3001'),
  WEBSOCKET_URL: z.string().default('ws://localhost:3000'),

  // --- OpenTelemetry ---
  OTEL_ENABLED: z.boolean().default(false),

  // --- Session Limits ---
  MAX_CONCURRENT_SESSIONS: z.coerce.number().int().positive().default(5),

  // --- Password Policy ---
  MIN_PASSWORD_LENGTH: z.coerce.number().int().min(8).max(256).default(8),

  // --- IP Hash Salt ---
  IP_HASH_SALT: z.string().min(16),
});

export type AppConfig = z.infer<typeof envSchema>;

// ------------------------------------------------------------------
// Parser con validación
// ------------------------------------------------------------------
function parseEnv(): AppConfig {
  try {
    const resolved = resolveEnvWithFile();
    return envSchema.parse(resolved);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const fieldMessages = err.errors.map(
        (e: z.ZodIssue) => `  ✗ ${e.path.join('.')}: ${e.message}`
      );
      console.error('\n[CONFIG ERROR] Variables de entorno inválidas:');
      fieldMessages.forEach((m: string) => console.error(m));
      process.exit(1);
    }
    throw err;
  }
}

// ------------------------------------------------------------------
// Singleton — config global (lazy, validado una sola vez)
// ------------------------------------------------------------------
let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) {
    _config = parseEnv();
    if (_config.NODE_ENV !== 'production') {
      console.log('[CONFIG] Environment loaded:', _config.NODE_ENV);
    }
  }
  return _config;
}

export const config: AppConfig = parseEnv();

// ------------------------------------------------------------------
// Helpers para sub-configuraciones — legacy aliases for compatibility
// ------------------------------------------------------------------
export function getDbConfig() {
  const c = getConfig();
  return {
    database: c.POSTGRES_DB,
    username: c.POSTGRES_USER,
    password: c.POSTGRES_PASSWORD,
    host: c.POSTGRES_HOST,
    port: c.POSTGRES_PORT,
    dialect: 'postgres' as const,
    logging: c.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000,
    },
    ssl: c.POSTGRES_SSL ? { rejectUnauthorized: false } : undefined,
    define: {
      timestamps: true,
      underscored: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
  };
}

export function getRedisConfig() {
  const c = getConfig();
  return {
    host: c.REDIS_HOST,
    port: c.REDIS_PORT,
    password: c.REDIS_PASSWORD,
    db: c.REDIS_DB,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    tls: c.NODE_ENV === 'production' ? {} : undefined,
  };
}

export function getImapBridgeConfig(): { host: string; port: number; tls: boolean } {
  const c = getConfig();
  return {
    host: c.DOVECOT_HOST,
    port: c.DOVECOT_PORT,
    tls: true,
  };
}

export function getSmtpBridgeConfig(): { host: string; port: number } {
  const c = getConfig();
  return {
    host: c.POSTFIX_HOST,
    port: c.POSTFIX_PORT,
  };
}

export function getAmavisBridgeConfig(): { host: string; port: number; controlPort: number } {
  const c = getConfig();
  return {
    host: c.AMAVIS_HOST,
    port: c.AMAVIS_PORT,
    controlPort: c.AMAVIS_CONTROL_PORT,
  };
}

export function getClamavBridgeConfig(): { host: string; port: number } {
  const c = getConfig();
  return {
    host: c.CLAMAV_HOST,
    port: c.CLAMAV_PORT,
  };
}