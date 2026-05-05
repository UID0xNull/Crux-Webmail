// ============================================================================
// Crux-Webmail — Fastify App Entry Point (Zero-Trust Server)
// ============================================================================
// Inicializa Fastify, aplica middleware global, registra rutas,
// y conecta bridges a Dovecot/Postfix.
// ============================================================================

import Fastify, { FastifyInstance } from 'fastify';
import { config } from './config/app.config';
import { securityHeadersPlugin } from './middleware/security-headers';
import { rateLimiterPlugin } from './middleware/rate-limiter';
import { authMiddleware } from './middleware/auth';
import { registerAuthRoutes } from './routes/auth.routes';
import { registerMailRoutes } from './routes/mail.routes';
import { getSmtpBridge } from './modules/mail/smtp-bridge';
import { getImapBridgePool } from './modules/mail/imap-bridge';
import { auditLogger } from './utils/audit-logger';
import { globalErrorHandler } from './errors/handler';

// ------------------------------------------------------------------
// App Factory — crea la instancia Fastify
// ------------------------------------------------------------------
export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: 'info',
      serializers: {
        req: (req: any) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          hostname: req.hostname,
          remoteAddress: req.socket?.remoteAddress,
        }),
        res: (res: any) => ({
          statusCode: res.statusCode,
        }),
      },
    },
    pluginTimeout: 10000,
    bodyLimit: 10 * 1024 * 1024, // 10MB body limit
    exposeHeadRoutes: false,
    disableRequestLogging: true, // Usamos nuestro audit logger
  });

  // ----------------------------------------------------------------
  // Global error handler
  // ----------------------------------------------------------------
  app.setErrorHandler(globalErrorHandler);

  // ----------------------------------------------------------------
  // Global hooks — pre-validation para sanitize input
  // ----------------------------------------------------------------
  app.addHook('preValidation', async (request: any) => {
    // X-Content-Type-Options enforcement
    if (request.url.startsWith('/api/')) {
      const contentType = request.headers['content-type'];
      if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Content-Type must be application/json');
        }
      }
    }
  });

  // ----------------------------------------------------------------
  // Middleware chain: headers → rate-limit → auth → routes
  // ----------------------------------------------------------------
  // 1. Security headers (all routes)
  app.register(securityHeadersPlugin);

  // 2. Rate limiter (all routes)
  app.register(rateLimiterPlugin);

  // ----------------------------------------------------------------
  // Auth routes (no auth middleware — public endpoints)
  // ----------------------------------------------------------------
  await app.register(async (server: FastifyInstance) => {
    await registerAuthRoutes(server);
  }, { prefix: '/api/auth' });

  // ----------------------------------------------------------------
  // Mail routes (WITH auth middleware — protected)
  // ----------------------------------------------------------------
  await app.register(async (server: FastifyInstance) => {
    await server.register(authMiddleware);
    await registerMailRoutes(server);
  }, { prefix: '/api/mail' });

  // ----------------------------------------------------------------
  // Health & readiness endpoints (always public)
  // ----------------------------------------------------------------
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0-zero-trust',
  }));

  app.get('/ready', async () => {
    // Verificar bridges
    const smtpHealth = getSmtpBridge().getHealth();
    const imapPoolSize = getImapBridgePool().getPoolSize();

    const ready = smtpHealth.status !== 'unhealthy';

    if (!ready) {
      throw new Error('One or more downstream services unavailable');
    }

    return {
      status: 'ready',
      services: {
        smtp: smtpHealth.status,
        imap_pool_size: imapPoolSize,
      },
      timestamp: new Date().toISOString(),
    };
  });

  // ----------------------------------------------------------------
  // 404 fallback
  // ----------------------------------------------------------------
  app.setNotFoundHandler((request: any, reply: any) => {
    reply.status(404);
    return {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Endpoint not found.',
      correlation_id: request.id,
    };
  });

  return app;
}

// ------------------------------------------------------------------
// Server lifecycle
// ------------------------------------------------------------------
async function bootstrap(): Promise<void> {
  console.log('[CRUX] Initializing Zero-Trust Webmail Server...');

  // 1. Create app
  const app = await createApp();

  // 2. Initialize bridges
  try {
    await getSmtpBridge().init();
    console.log('[CRUX] SMTP Bridge initialized');
  } catch (err) {
    console.warn('[CRUX] SMTP Bridge init deferred (non-critical)');
  }

  // 3. Start listening
  try {
    await app.listen({
      host: config.APP_HOST,
      port: config.APP_PORT,
    });

    console.log(`[CRUX] Server listening on ${config.APP_HOST}:${config.APP_PORT}`);
    auditLogger.info('Server started', {
      metadata: {
        host: config.APP_HOST,
        port: config.APP_PORT,
        node_env: config.APP_ENV,
      },
    });
  } catch (err) {
    auditLogger.critical('Server startup failed', {
      metadata: { error: (err as Error).message },
    });
    process.exit(1);
  }

  // ----------------------------------------------------------------
  // Graceful shutdown
  // ----------------------------------------------------------------
  const shutdown = async (signal: string) => {
    console.log(`[CRUX] Received ${signal} — graceful shutdown...`);

    try {
      await app.close();
      await getSmtpBridge().shutdown();
      await getImapBridgePool().shutdown();
      console.log('[CRUX] Clean shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('[CRUX] Error during shutdown:', (err as Error).message);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ------------------------------------------------------------------
// Entry point
// ------------------------------------------------------------------
if (require.main === module) {
  bootstrap().catch((err: Error) => {
    console.error('[CRUX] Fatal bootstrap error:', err);
    process.exit(1);
  });
}