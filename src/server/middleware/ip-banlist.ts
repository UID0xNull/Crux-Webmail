// ============================================================================
// Crux-Webmail — IP Banlist Enforcement Middleware
// ============================================================================
// Consulta la lista de IPs baneadas en Redis. Permite auto-ban y manual-ban.
// Se ejecuta ANTES del rate limiter para rechazar traffic de IPs baneadas.
// ============================================================================

import { FastifyPluginCallback } from 'fastify';
import { getRedis } from 'utils/connections';
import { hashIp } from 'utils/crypto';
import { auditLogger } from 'utils/audit-logger';

const BANLIST_CHECK_KEY = 'ban:';
const BANLIST_SALT = 'ip-banlist-salt-v1';
const BANLIST_CHECK_SKIP = ['/health', '/ready'];

const ipBanlistPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      const path = request.url;

      // Skip for health endpoints
      if (BANLIST_CHECK_SKIP.includes(path)) {
        return;
      }

      const clientIp = request.ip || request.socket.remoteAddress || 'unknown';
      const ipHash = hashIp(clientIp, BANLIST_SALT);
      const banKey = `${BANLIST_CHECK_KEY}${ipHash}`;

      const redis = await getRedis();
      const isBanned = await redis.get(banKey);

      if (isBanned) {
        // Get TTL remaining
        const ttl = await redis.ttl(banKey);
        auditLogger.warn('Banned IP rejected', {
          client_ip: clientIp,
          session_id: request.id,
          metadata: {
            ip_hash: ipHash,
            ttl_remaining: ttl,
            path,
          },
        });

        reply.header('Retry-After', String(Math.max(1, ttl)));
        return reply.status(403).send({
          status: 403,
          code: 'IP_BANNED',
          message: 'This IP address has been banned. Contact administrator if you believe this is an error.',
          correlation_id: request.id,
        });
      }
    } catch (err) {
      // Fail-open: si Redis no está disponible, no bloquear tráfico legítimo
      auditLogger.error('IP banlist check failed — fail-open', {
        metadata: { error: (err as Error).message },
      });
    }
  });

  done();
};

// ------------------------------------------------------------------
// Ban IP endpoint (para uso interno del admin panel)
// ------------------------------------------------------------------
async function banIp(fastify: Parameters<FastifyPluginCallback>[0]): Promise<void> {
  const banKeyPrefix = 'ban:';

  // Registrar una IP en la blacklist (admin-only, protegido por admin-auth)
  fastify.post('/admin/banlist/:ip', {
    preHandler: async () => {}, // Placeholder — protegido por admin auth routes
  }, async (request: any, reply: any) => {
    try {
      const clientIp = request.params.ip;
      const durationSeconds = request.body?.duration_seconds || 3600; // Default 1h

      // Validate IP format
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      const ipv6Regex = /^([0-9a-fA-F:]{3,39})$/;
      if (!ipRegex.test(clientIp) && !ipv6Regex.test(clientIp)) {
        return reply.status(400).send({
          status: 400,
          code: 'INVALID_IP',
          message: 'Invalid IP address format.',
        });
      }

      const ipHash = hashIp(clientIp, BANLIST_SALT);
      const redis = await getRedis();
      await redis.set(`${banKeyPrefix}${ipHash}`, 'banned', 'EX', durationSeconds);

      auditLogger.critical('IP manually banned via admin panel', {
        actor_id: request.admin?.user_id || 'unknown',
        metadata: {
          ip: clientIp,
          duration_seconds: durationSeconds,
        },
      });

      return reply.send({
        status: 200,
        message: 'IP banned successfully.',
        details: {
          ip: clientIp,
          banned_until: new Date(Date.now() + durationSeconds * 1000).toISOString(),
        },
      });
    } catch (err) {
      return reply.status(500).send({
        status: 500,
        code: 'BAN_ERROR',
        message: 'Failed to ban IP.',
      });
    }
  });

  // Unban una IP
  fastify.delete('/admin/banlist/:ip', async (request: any, reply: any) => {
    try {
      const clientIp = request.params.ip;
      const ipHash = hashIp(clientIp, BANLIST_SALT);
      const redis = await getRedis();
      await redis.del(`${banKeyPrefix}${ipHash}`);

      auditLogger.info('IP unbanned via admin panel', {
        actor_id: request.admin?.user_id || 'unknown',
        metadata: { ip: clientIp },
      });

      return reply.send({
        status: 200,
        message: 'IP unbanned successfully.',
      });
    } catch {
      return reply.status(500).send({
        status: 500,
        code: 'UNBAN_ERROR',
        message: 'Failed to unban IP.',
      });
    }
  });

  // Listar IPs baneadas actuales
  fastify.get('/admin/banlist', async (request: any, reply: any) => {
    try {
      const redis = await getRedis();
      const keys = await redis.keys(`${banKeyPrefix}*`);

      // For each key get TTL and decode
      const bannedIps = await Promise.all(
        keys.map(async (key) => {
          const ttl = await redis.ttl(key);
          return {
            hash: key.replace(banKeyPrefix, ''),
            ttl: Math.max(0, ttl),
            expires_at: new Date(Date.now() + Math.max(0, ttl) * 1000).toISOString(),
          };
        })
      );

      return reply.send({
        status: 200,
        count: bannedIps.length,
        banlist: bannedIps,
      });
    } catch {
      return reply.status(500).send({
        status: 500,
        code: 'LIST_ERROR',
        message: 'Failed to list banlist.',
      });
    }
  });
}

export { ipBanlistPlugin, banIp };