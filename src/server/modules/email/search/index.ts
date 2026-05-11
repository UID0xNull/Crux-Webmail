// ============================================================================
// Crux-Webmail — Search Module Barrel Export
// ============================================================================

export {
  SearchIndexer,
  tokenize,
  filterStopWords,
  stem,
  onNewEmail,
  onDeletedEmail,
  onMovedEmail,
} from './search-indexer';

export {
  registerSearchRoutes,
} from './search-route';

export {
  SEARCH_QUEUE_JOBS,
  registerSearchQueue,
  handleIndexEmailJob,
  handleBulkIndexJob,
  handleRemoveIndexJob,
  type IndexJobData,
  type BulkIndexJobData,
  type RemoveIndexJobData,
} from './search-queue-handler';

export type {
  SearchableMessage,
  SearchQuery,
  SearchResults,
  IndexStatus,
} from './search-indexer';