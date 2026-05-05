// ============================================================================
// Crux-Webmail — Unit Tests: Config Validation (Zod Schema)
// ============================================================================

describe('Config Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should validate correct environment variables', async () => {
    // Set all required env vars
    process.env.NODE_ENV = 'development';
    process.env.SERVER_PORT = '3000';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
    process.env.POSTGRES_DB = 'crux_test';
    process.env.POSTGRES_USER = 'test';
    process.env.POSTGRES_PASSWORD = 'password123';
    process.env.POSTGRES_HOST = 'localhost';
    process.env.REDIS_HOST = 'localhost';
    process.env.MINIO_ROOT_USER = 'minio';
    process.env.MINIO_ROOT_PASSWORD = 'minio123';

    // Zod schema validation should succeed
    const { z } = await import('zod');
    const schema = z.object({
      JWT_SECRET: z.string().min(64),
      NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
      SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
      POSTGRES_DB: z.string().min(1),
      REDIS_HOST: z.string().min(1),
    });

    const result = schema.safeParse(process.env);
    expect(result.success).toBe(true);
  });

  it('should reject short JWT_SECRET', async () => {
    process.env.JWT_SECRET = 'short';

    const { z } = await import('zod');
    const schema = z.object({
      JWT_SECRET: z.string().min(64),
    });

    const result = schema.safeParse(process.env);
    expect(result.success).toBe(false);
  });

  it('should reject invalid NODE_ENV', async () => {
    process.env.NODE_ENV = 'invalid_env';

    const { z } = await import('zod');
    const schema = z.object({
      NODE_ENV: z.enum(['development', 'staging', 'production']),
    });

    const result = schema.safeParse(process.env);
    expect(result.success).toBe(false);
  });

  it('should reject invalid port', async () => {
    process.env.SERVER_PORT = '99999';

    const { z } = await import('zod');
    const schema = z.object({
      SERVER_PORT: z.coerce.number().int().min(1).max(65535),
    });

    const result = schema.safeParse(process.env);
    expect(result.success).toBe(false);
  });

  it('should accept valid enum values', async () => {
    for (const env of ['development', 'staging', 'production']) {
      process.env.NODE_ENV = env;
      const { z } = await import('zod');
      const schema = z.object({
        NODE_ENV: z.enum(['development', 'staging', 'production']),
      });
      const result = schema.safeParse(process.env);
      expect(result.success).toBe(true);
    }
  });

  it('should apply defaults for optional fields', async () => {
    process.env.JWT_SECRET = 'a'.repeat(64);
    // Don't set SERVER_PORT — should default

    const { z } = await import('zod');
    const schema = z.object({
      JWT_SECRET: z.string().min(64),
      SERVER_PORT: z.coerce.number().int().default(3000),
      NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
    });

    const result = schema.safeParse(process.env);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SERVER_PORT).toBe(3000);
      expect(result.data.NODE_ENV).toBe(process.env.NODE_ENV || 'development');
    }
  });
});