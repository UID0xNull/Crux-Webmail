// ============================================================================
// Crux-Webmail — Search Route (Fastify)
// ============================================================================
// Endpoint REST para búsqueda full-text de emails.
// ============================================================================

import { FastifyInstance } from 'fastify';
import { SearchIndexer } from './search-indexer';
import { z } from 'zod';

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  folder: z.string().max(100).optional(),
  flag: z.string().max(50).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const errorSchema = { type: 'object', properties: { error: { type: 'string' } } };

export async function registerSearchRoutes(server: FastifyInstance): Promise<void> {
  const indexer = new SearchIndexer();

  server.get('/api/search', {
    schema: {
      operationId: 'searchEmails',
      summary: 'Full-text search emails',
      tags: ['Search'],
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', minLength: 1, maxLength: 500 },
          folder: { type: 'string' },
          flag: { type: 'string' },
          dateFrom: { type: 'string', format: 'date-time' },
          dateTo: { type: 'string', format: 'date-time' },
          limit: { type: 'number', integer: true, minimum: 1, maximum: 100, default: 25 },
          offset: { type: 'number', integer: true, minimum: 0, default: 0 },
        },
        required: ['q'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            items: { type: 'array' },
            total: { type: 'number' },
            nextCursor: { oneOf: [{ type: 'string' }, { type: 'null' }] },
            prevCursor: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          },
        },
        400: errorSchema,
        401: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const userId = (request as any).user?.id;
      if (!userId) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const query = request.query as Record<string, any>;
      const parsed = SearchQuerySchema.safeParse(query);

      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Invalid search parameters',
        });
      }

      const { q, folder, flag, dateFrom, dateTo, limit, offset } = parsed.data;

      const results = await indexer.search(userId, q, { folder, flag, dateFrom, dateTo, limit, offset });

      return reply.code(200).send(results);
    } catch (error) {
      server.log.error({ err: error }, 'Search failed');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  server.get('/api/search/status', {
    schema: {
      operationId: 'getSearchStatus',
      summary: 'Get search index status',
      tags: ['Search'],
      response: {
        200: {
          type: 'object',
          properties: {
            totalDocuments: { type: 'number' },
            totalTerms: { type: 'number' },
            lastUpdated: { type: 'string', format: 'date-time' },
          },
        },
        401: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const userId = (request as any).user?.id;
      if (!userId) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const status = await indexer.getIndexStatus(userId);
      return reply.code(200).send(status);
    } catch (error) {
      server.log.error({ err: error }, 'Search status failed');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  server.post('/api/search/reindex', {
    schema: {
      operationId: 'reindexUserEmails',
      summary: 'Trigger full reindex for current user',
      tags: ['Search'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['started', 'completed'] },
            message: { type: 'string' },
          },
        },
        401: errorSchema,
        500: errorSchema,
      },
    },
  }, async (request, reply) => {
    try {
      const userId = (request as any).user?.id;
      if (!userId) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      await indexer.reindex(userId);

      return reply.code(200).send({
        status: 'started',
        message: 'Reindexing triggered. This may take a few moments.',
      });
    } catch (error) {
      server.log.error({ err: error }, 'Reindex failed');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}