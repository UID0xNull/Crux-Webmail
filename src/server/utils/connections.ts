// ============================================================================
// Crux-Webmail — Conexiones Seguras (Redis + PostgreSQL)
// ============================================================================
import { Redis } from 'ioredis';
import { Sequelize } from 'sequelize';
import { getDbConfig, getRedisConfig, config } from '../config/app.config';

// ------------------------------------------------------------------
// Redis — Singleton
// ------------------------------------------------------------------
let redisInstance: Redis | null = null;

export async function getRedis(): Promise<Redis> {
  if (!redisInstance) {
    const rConfig = getRedisConfig();
    redisInstance = new Redis(rConfig);
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
    const dbConfig = getDbConfig();
    sequelizeInstance = new Sequelize(dbConfig);
    await sequelizeInstance.authenticate();
    console.log('[POSTGRES] Connected to', dbConfig.host, ':', dbConfig.port);
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