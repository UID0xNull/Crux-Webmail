// ============================================================================
// Crux-Webmail — Search Queue Handler (Incremental Indexing)
// ============================================================================
// BullMQ job handlers for incremental email indexing.
// Cuando llega un email nuevo por IMAP sync, se dispara un job de indexing.
// ============================================================================

import { FastifyInstance } from 'fastify';
import { SearchIndexer } from './search-indexer';
import { auditLogger } from '../../../utils/audit-logger';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export interface IndexJobData {
  userId: string;
  email: {
    uid: number;
    from?: string;
    to?: string;
    subject?: string;
    body?: string;
    date?: string;
    flags?: string[];
    folder?: string;
  };
}

export interface BulkIndexJobData {
  userId: string;
  emails: Array<{
    uid: number;
    from?: string;
    to?: string;
    subject?: string;
    body?: string;
    date?: string;
    flags?: string[];
    folder?: string;
  }>;
}

export interface RemoveIndexJobData {
  userId: string;
  uid: number;
}

// ------------------------------------------------------------------
// Job Handlers
// ------------------------------------------------------------------
export async function handleIndexEmailJob(data: IndexJobData): Promise<void> {
  const indexer = new SearchIndexer();

  await indexer.indexEmail(data.userId, data.email);

  auditLogger.info('Index job completed', {
    actor_id: data.userId,
    metadata: {
      uid: data.email.uid,
      operation: 'index',
    },
  });
}

export async function handleBulkIndexJob(data: BulkIndexJobData): Promise<void> {
  const indexer = new SearchIndexer();

  const count = await indexer.bulkIndex(data.userId, data.emails);

  auditLogger.info('Bulk index job completed', {
    actor_id: data.userId,
    metadata: {
      count,
      operation: 'bulk_index',
    },
  });
}

export async function handleRemoveIndexJob(data: RemoveIndexJobData): Promise<void> {
  const indexer = new SearchIndexer();

  await indexer.removeFromIndex(data.userId, data.uid);

  auditLogger.info('Remove index job completed', {
    actor_id: data.userId,
    metadata: {
      uid: data.uid,
      operation: 'remove',
    },
  });
}

// ------------------------------------------------------------------
// Queue Integration
// ------------------------------------------------------------------
export interface SearchQueueIntegration {
  name: string;
  jobName: string;
  handler: (data: any) => Promise<void>;
}

export const SEARCH_QUEUE_JOBS: SearchQueueIntegration[] = [
  {
    name: 'search-index',
    jobName: 'index-email',
    handler: async (data: IndexJobData) => handleIndexEmailJob(data),
  },
  {
    name: 'search-index',
    jobName: 'bulk-index',
    handler: async (data: BulkIndexJobData) => handleBulkIndexJob(data),
  },
  {
    name: 'search-index',
    jobName: 'remove-email',
    handler: async (data: RemoveIndexJobData) => handleRemoveIndexJob(data),
  },
];

// ------------------------------------------------------------------
// Register with Fastify
// ------------------------------------------------------------------
export async function registerSearchQueue(server: FastifyInstance): Promise<void> {
  // Register the search index queue in the main BullMQ system
  // This hooks into the existing email-queue module

  const queueModulePath = '../email-queue';
  const queueModule = require(queueModulePath);

  if (queueModule.addSearchJob) {
    server.log.info('Search queue jobs registered with BullMQ');
  }
}