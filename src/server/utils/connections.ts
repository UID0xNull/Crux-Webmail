// ============================================================================
// Crux-Webmail — Conexiones Seguras (Redis + PostgreSQL)
// ============================================================================
import { Redis } from 'ioredis';
import { Sequelize } from 'sequelize';
import { config, getRedisConfig, getConfig } from 'config/app.config';

// ------------------------------------------------------------------
// Redis — Singleton
// ------------------------------------------------------------------
let redisInstance: Redis | null = null;

export async function getRedis(): Promise<Redis> {
  if (!redisInstance) {
    const rConfig = getRedisConfig();
    const redisOptions = {
      host: rConfig.host,
      port: rConfig.port,
      password: rConfig.password || undefined, // null → undefined
      db: rConfig.db,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };
    redisInstance = new Redis(redisOptions);
    redisInstance.on('connect', () => {
      console.log('[REDIS] Connected to', rConfig.host, ':', rConfig.port);
    });
    redisInstance.on('error', (err) => {
      console.error('[REDIS] Error:', err.message);
    });
    await redisInstance.connect();
  }
  return redisInstance;
}

// ------------------------------------------------------------------
// PostgreSQL — Singleton (Sequelize)
// ------------------------------------------------------------------
let sequelizeInstance: Sequelize | null = null;

export async function getSequelize(): Promise<Sequelize> {
  if (!sequelizeInstance) {
    const c = getConfig();
    const pool: any = {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000,
    };

    let ssl: any; // Usar 'any' para evitar conflictos de tipo en construcción dinámica
    if (config.NODE_ENV === 'production' && c.POSTGRES_SSL) {
      ssl = { rejectUnauthorized: false };
    }

    sequelizeInstance = new Sequelize({
      dialect: 'postgres',
      database: c.POSTGRES_DB,
      username: c.POSTGRES_USER,
      password: c.POSTGRES_PASSWORD,
      host: c.POSTGRES_HOST,
      port: c.POSTGRES_PORT,
      ...(ssl !== undefined ? { ssl } : {}),
      logging: c.NODE_ENV === 'development' ? console.log : false,
      pool,
    });

    await sequelizeInstance.authenticate();
    console.log('[POSTGRES] Connected to', c.POSTGRES_HOST, ':', c.POSTGRES_PORT);
  }
  return sequelizeInstance;
}

// ------------------------------------------------------------------
// Health check — validación de conexiones activas
// ------------------------------------------------------------------
export async function checkConnections(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  try {
    const redis = await getRedis();
    const pong = await redis.ping();
    results.redis = pong === 'PONG';
  } catch {
    results.redis = false;
  }
  try {
    const seq = await getSequelize();
    await seq.query('SELECT 1');
    results.postgres = true;
  } catch {
    results.postgres = false;
  }
  return results;
}

// ------------------------------------------------------------------
// Graceful shutdown
// ------------------------------------------------------------------
export async function closeConnections(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
  if (sequelizeInstance) {
    await sequelizeInstance.close();
    sequelizeInstance = null;
  }
  console.log('[CONNECTIONS] All connections closed.');
}