// ============================================================================
// Crux-Webmail Frontend — Environment Validation with Zod
// ============================================================================
// Validates all NEXT_PUBLIC_* env vars at module load time.
// Exits with error on invalid config in production.
// ============================================================================

import { z } from 'zod';

// ------------------------------------------------------------------
// Schema de validación estricto para variables NEXT_PUBLIC_*
// ------------------------------------------------------------------
const frontendEnvSchema = z.object({
  // --- App ---
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('Crux-Webmail'),
  NEXT_PUBLIC_APP_VERSION: z.string().min(1).default('0.4.0'),
  NEXT_PUBLIC_NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  // --- API ---
  NEXT_PUBLIC_API_URL: z.string().url('API URL must be a valid URL').default('http://localhost:3000'),

  // --- WebSocket ---
  NEXT_PUBLIC_WS_HOST: z.string().min(1).optional(),

  // --- Security ---
  NEXT_PUBLIC_CSP_NONCE_SOURCE: z.enum(['server', 'client', 'disabled']).default('server'),
  NEXT_PUBLIC_E2E_ENCRYPTION_REQUIRED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // --- UI ---
  NEXT_PUBLIC_DEFAULT_THEME: z.enum(['light', 'dark', 'system']).default('system'),
  NEXT_PUBLIC_MAX_NOTIFICATIONS: z.coerce.number().int().positive().default(100),

  // --- Email rendering ---
  NEXT_PUBLIC_SANDBOX_RENDERER_URL: z.string().default('/__sandbox/email-renderer'),

  // --- Logging ---
  NEXT_PUBLIC_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('warn'),

  // --- Feature Flags ---
  NEXT_PUBLIC_ENABLE_WEBSOCKET: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  NEXT_PUBLIC_ENABLE_QUARANTINE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  NEXT_PUBLIC_ENABLE_E2E_CRYPTO: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  NEXT_PUBLIC_ENABLE_ADMIN_PANEL: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

  // --- Rate Limiting (UI feedback) ---
  NEXT_PUBLIC_RATE_LIMIT_DISPLAY_MS: z.coerce.number().int().positive().default(3000),

  // --- Session ---
  NEXT_PUBLIC_SESSION_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  NEXT_PUBLIC_MAX_CONCURRENT_SESSIONS: z.coerce.number().int().positive().default(5),

  // --- Password Policy (frontend hints) ---
  NEXT_PUBLIC_MIN_PASSWORD_LENGTH: z.coerce.number().int().min(1).max(256).default(8),
  NEXT_PUBLIC_REQUIRE_MFA: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

  // --- CORS Proxy ---
  NEXT_PUBLIC_CORS_PROXY_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export type FrontendEnv = z.infer<typeof frontendEnvSchema>;

// ------------------------------------------------------------------
// Resolver — lee process.env, aplica defaults y valida
// ------------------------------------------------------------------
function resolveEnv(): FrontendEnv {
  const rawEnv: Record<string, string | undefined> = { ...process.env };

  // Map NODE_ENV → NEXT_PUBLIC_NODE_ENV si no está seteada
  if (!rawEnv.NEXT_PUBLIC_NODE_ENV && rawEnv.NODE_ENV) {
    rawEnv.NEXT_PUBLIC_NODE_ENV = rawEnv.NODE_ENV;
  }

  try {
    return frontendEnvSchema.parse(rawEnv);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.errors.map((e: z.ZodIssue) => `  ✗ ${e.path.join('.')}: ${e.message}`);
      console.error('\n[ENV ERROR] Invalid frontend environment:');
      issues.forEach((m: string) => console.error(m));

      const isProd = rawEnv.NEXT_PUBLIC_NODE_ENV === 'production' || rawEnv.NODE_ENV === 'production';
      if (isProd) {
        process.exit(1);
      }
      // In dev, return defaults with warnings
      console.warn('[ENV] Using defaults due to missing environment variables');
      return frontendEnvSchema.parse({});
    }
    throw err;
  }
}

// ------------------------------------------------------------------
// Singleton — config global (validado una sola vez)
// ------------------------------------------------------------------
let _env: FrontendEnv | null = null;

export function getEnv(): FrontendEnv {
  if (!_env) {
    _env = resolveEnv();
  }
  return _env;
}

// Eager evaluate at module load
export const env: FrontendEnv = resolveEnv();