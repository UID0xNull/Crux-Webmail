// ============================================================================
// Crux-Webmail - Fastify Plugin: Mail Infrastructure
// ============================================================================
// Registers MailConnectionManager + MailService in Fastify context.
// Guarantees ordered init (onReady), safe teardown (onClose) without leaks.
// ============================================================================

import { FastifyPluginAsync } from "fastify";
import { getMailConnectionManager, resetMailConnectionManager } from "./connection-manager";
import { getMailService, resetMailService } from "./mail-service";

declare module "fastify" {
  interface FastifyInstance {
    mailManager: ReturnType<typeof getMailConnectionManager>;
    mailService: ReturnType<typeof getMailService>;
  }
}

const mailPlugin: FastifyPluginAsync = async (fastify, _opts) => {
  const manager = getMailConnectionManager();
  const service = getMailService();

  fastify.decorate("mailManager", manager);
  fastify.decorate("mailService", service);

  fastify.addHook("onReady", async () => {
    manager.start();
    fastify.log.info("[MailPlugin] MailConnectionManager started", {
      maxPoolSize: 50,
      idleTimeoutMs: 600000,
    });
  });

  fastify.addHook("onClose", async () => {
    await service.shutdown();
    resetMailService();
    resetMailConnectionManager();
    fastify.log.info("[MailPlugin] Mail infrastructure shut down");
  });

  fastify.get("/api/mail/pool-status", {
    config: { description: "Mail connection pool status" },
    async handler(_request, reply) {
      try {
        const poolInfo = service.getPoolInfo();
        return {
          pool: {
            total: poolInfo.total,
            active: poolInfo.active,
            idle: poolInfo.idle,
            entries: poolInfo.entries.map((e) => ({
              key: e.key,
              idle: e.idle,
              imapPhase: e.imapPhase,
              smtpReady: e.smtpReady,
              circuitOpen: e.circuitOpen,
              failureCount: e.failureCount,
              lastActivityAgo: Date.now() - e.lastActivity,
            })),
          },
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        fastify.log.error("[MailPlugin] Pool status failed", {
          error: (err as Error).message,
        });
        return reply.code(503).send({ error: "Mail pool unavailable" });
      }
    },
  });
};

export default mailPlugin;