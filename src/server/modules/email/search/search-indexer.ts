// ============================================================================
// Crux-Webmail — Search Indexer (Step 6: Full-Text Search & Incremental Index)
// ============================================================================
// Motor de búsqueda full-text con indexación incremental, tokenización,
// stemming básico, y filtrado por stop words. Almacena índices en PostgreSQL.
// ============================================================================

import { UserModel } from '../../../models/User';
import { auditLogger } from '../../../utils/audit-logger';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export interface SearchableMessage {
  uid: number;
  userId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  flags: string[];
  folder: string;
  score?: number;
}

export interface SearchQuery {
  text: string;
  userId: string;
  folder?: string;
  flag?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResults {
  items: SearchableMessage[];
  total: number;
  nextCursor: string | null;
  prevCursor: string | null;
}

export interface IndexStatus {
  totalDocuments: number;
  totalTerms: number;
  lastUpdated: string;
}

// ------------------------------------------------------------------
// Stop Words
// ------------------------------------------------------------------
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'shall',
  'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'these',
  'that', 'it', 'its', 'his', 'her', 'their', 'this',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them',
]);

// ------------------------------------------------------------------
// Stemming (Porter-like simplified)
// ------------------------------------------------------------------
const STEM_RULES: [RegExp, string][] = [
  [/(ational)$/, '\1tion'],
  [/(tional)$/, '\1'],
  [/(enci)$/, '\1ence'],
  [/(anci)$/, '\1ance'],
  [/(izer)$/, '\1ize'],
  [/(abli)$/, '\1able'],
  [/(alli)$/, '\1al'],
  [/(entli)$/, '\1ent'],
  [/(eli)$/, '\1e'],
  [/(ousli)$/, '\1ous'],
  [/(ization)$/, '\1ize'],
  [/(ation)$/, '\1ate'],
  [/(ator)$/, '\1ate'],
  [/(alism)$/, '\1ali'],
  [/(iveness)$/, '\1ive'],
  [/(fulness)$/, '\1ful'],
  [/(fulness)$/, '\1ful'],
  [/(fulness)$/, '\1ful'],
  [/(ness)$/, '\1'],
  [/(nesses)$/, '\1'],
  [/(ing)$/, '\1'],
  [/(ed)$/, '\1'],
  [/(er)$/, '\1'],
  [/(ly)$/, '\1'],
  [/(es)$/, '\1'],
  [/(s)$/, '\1'],
];

function stemWord(word: string): string {
  if (word.length <= 3) return word.toLowerCase();
  let result = word.toLowerCase();
  for (const [pattern, replacement] of STEM_RULES) {
    result = result.replace(pattern, replacement as string);
  }
  return result;
}

// ------------------------------------------------------------------
// Tokenizer
// ------------------------------------------------------------------
export function tokenize(text: string): string[] {
  if (!text) return [];

  const normalized = text.toLowerCase()
    .replace(/[<>"'\[\](){}]/g, ' ')
    .replace(/[\.,;:!\?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return [];

  return normalized
    .split(' ')
    .filter((token) => {
      if (STOP_WORDS.has(token)) return false;
      if (token.length < 2) return false;
      return true;
    })
    .map((token) => stemWord(token))
    .filter((token) => token.length > 0);
}

export function filterStopWords(text: string): string {
  if (!text) return '';
  const normalized = text.toLowerCase().replace(/[<>"'\[\](){}]/g, ' ').replace(/[\.,;:!\?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized
    .split(' ')
    .filter((token) => !STOP_WORDS.has(token) && token.length >= 2)
    .join(' ');
}

export function stem(word: string): string {
  return stemWord(word);
}

// ------------------------------------------------------------------
// Scoring (TF-IDF-like)
// ------------------------------------------------------------------
function computeScore(docTerms: string[], queryTerms: string[], maxScore: number = 100): number {
  if (queryTerms.length === 0) return 0;

  const termFreq: Record<string, number> = {};
  for (const term of docTerms) {
    termFreq[term] = (termFreq[term] || 0) + 1;
  }

  let score = 0;
  for (const qTerm of queryTerms) {
    score += (termFreq[qTerm] || 0);
  }

  // Normalize
  return Math.min(Math.round((score / docTerms.length) * maxScore * 100) / 100, maxScore);
}

// ------------------------------------------------------------------
// In-Memory Index (for prototyping; PostgreSQL-backed in production)
// ------------------------------------------------------------------
class InMemoryIndex {
  private docs = new Map<string, Map<number, SearchableMessage>>();
  private termIndex = new Map<string, Set<string>>();
  private lastUpdated = new Date();

  private getDocKey(userId: string): string {
    return userId;
  }

  add(message: SearchableMessage): void {
    const docKey = this.getDocKey(message.userId);

    if (!this.docs.has(docKey)) {
      this.docs.set(docKey, new Map());
    }

    const userDocs = this.docs.get(docKey)!;
    userDocs.set(message.uid, message);

    // Update term index
    const allText = [message.subject, message.body, message.from, message.to].join(' ');
    const tokens = tokenize(allText);

    for (const term of tokens) {
      if (!this.termIndex.has(term)) {
        this.termIndex.set(term, new Set());
      }
      this.termIndex.get(term)!.add(`${docKey}:${message.uid}`);
    }

    this.lastUpdated = new Date();
  }

  remove(userId: string, uid: number): void {
    const docKey = this.getDocKey(userId);
    const userDocs = this.docs.get(docKey);

    if (userDocs?.has(uid)) {
      const message = userDocs.get(uid);
      if (message) {
        const allText = [message.subject, message.body, message.from, message.to].join(' ');
        const tokens = tokenize(allText);

        for (const term of tokens) {
          const termSet = this.termIndex.get(term);
          termSet?.delete(`${docKey}:${uid}`);
        }
      }
      userDocs.delete(uid);
      this.lastUpdated = new Date();
    }
  }

  search(queryTerms: string[], userId: string, filters?: Partial<SearchableMessage>): SearchableMessage[] {
    const docKey = this.getDocKey(userId);
    const userDocs = this.docs.get(docKey);

    if (!userDocs) return [];

    // Find candidate docs
    const candidates = new Map<number, number>();

    for (const term of queryTerms) {
      const termSet = this.termIndex.get(term);
      if (!termSet) continue;

      for (const docRef of termSet) {
        const [refUser, uidStr] = docRef.split(':');
        if (refUser === docKey) {
          const uid = parseInt(uidStr, 10);
          candidates.set(uid, (candidates.get(uid) || 0) + 1);
        }
      }
    }

    // Score and sort
    const scored: Array<{ message: SearchableMessage; score: number }> = [];

    for (const [uid, relevance] of candidates) {
      const message = userDocs.get(uid);
      if (!message) continue;

      // Apply filters
      if (filters.folder && message.folder !== filters.folder) continue;
      if (filters.flag && !message.flags.includes(filters.flag)) continue;
      if (filters.dateFrom && message.date < filters.dateFrom) continue;
      if (filters.dateTo && message.date > filters.dateTo) continue;

      const allText = [message.subject, message.body, message.from, message.to].join(' ');
      const docTerms = tokenize(allText);
      const score = computeScore(docTerms, queryTerms);

      scored.push({ message, score: Math.max(score, relevance * 10) });
    }

    scored.sort((a, b) => b.score - a.score);

    return scored.map((s) => {
      s.message.score = s.score;
      return s.message;
    });
  }

  getAllForUser(userId: string): SearchableMessage[] {
    const userDocs = this.docs.get(userId);
    return userDocs ? Array.from(userDocs.values()) : [];
  }

  countForUser(userId: string): number {
    const userDocs = this.docs.get(userId);
    return userDocs ? userDocs.size : 0;
  }

  getStatus(userId: string): IndexStatus {
    return {
      totalDocuments: this.countForUser(userId),
      totalTerms: this.termIndex.size,
      lastUpdated: this.lastUpdated.toISOString(),
    };
  }

  async persistToDatabase(): Promise<void> {
    // In production: write to IndexedMessage model in batches
    // For now, this is the bridge point for the incremental sync
    auditLogger.info('Index persist checkpoint', {
      metadata: {
        totalTerms: this.termIndex.size,
        lastUpdated: this.lastUpdated.toISOString(),
      },
    });
  }
}

// ------------------------------------------------------------------
// Search Indexer (Singleton)
// ------------------------------------------------------------------
const index = new InMemoryIndex();

export class SearchIndexer {
  // Index a single email
  async indexEmail(userId: string, email: Partial<SearchableMessage>): Promise<void> {
    const message: SearchableMessage = {
      uid: email.uid ?? 0,
      userId,
      from: email.from ?? '',
      to: email.to ?? '',
      subject: email.subject ?? '',
      body: email.body ?? '',
      date: email.date ?? new Date().toISOString(),
      flags: email.flags ?? [],
      folder: email.folder ?? 'INBOX',
    };

    index.add(message);

    auditLogger.info('Email indexed', {
      actor_id: userId,
      metadata: { uid: message.uid, folder: message.folder },
    });
  }

  // Remove an email from index
  async removeFromIndex(userId: string, uid: number): Promise<void> {
    index.remove(userId, uid);
    auditLogger.info('Email removed from index', {
      actor_id: userId,
      metadata: { uid },
    });
  }

  // Bulk index emails
  async bulkIndex(userId: string, emails: Partial<SearchableMessage>[]): Promise<number> {
    let count = 0;
    for (const email of emails) {
      await this.indexEmail(userId, email);
      count++;
    }

    // Persist after bulk
    await index.persistToDatabase();

    auditLogger.info('Bulk index completed', {
      actor_id: userId,
      metadata: { count },
    });

    return count;
  }

  // Search emails
  async search(
    userId: string,
    queryText: string,
    options: {
      folder?: string;
      flag?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<SearchResults> {
    const queryTerms = tokenize(queryText);

    const filters: Partial<SearchableMessage> = {};
    if (options.folder) filters.folder = options.folder;
    if (options.flag) filters.flag = options.flag;
    if (options.dateFrom) filters.dateFrom = options.dateFrom;
    if (options.dateTo) filters.dateTo = options.dateTo;

    let results = index.search(queryTerms, userId, filters);

    const limit = options.limit ?? 25;
    const offset = options.offset ?? 0;

    const paged = results.slice(offset, offset + limit);
    const hasMore = offset + limit < results.length;

    auditLogger.info('Search executed', {
      actor_id: userId,
      metadata: {
        query: queryText,
        results: results.length,
        returned: paged.length,
      },
    });

    return {
      items: paged,
      total: results.length,
      nextCursor: hasMore ? String(offset + limit) : null,
      prevCursor: offset > 0 ? String(Math.max(0, offset - limit)) : null,
    };
  }

  // Get index status
  async getIndexStatus(userId: string): Promise<IndexStatus> {
    return index.getStatus(userId);
  }

  // Full reindex for a user
  async reindex(userId: string): Promise<void> {
    const user = await UserModel.findByPk(userId);
    if (!user) {
      auditLogger.warn('Reindex failed — user not found', { actor_id: userId });
      return;
    }

    // In production: trigger IMAP sync to rebuild index from scratch
    auditLogger.info('Reindex triggered', {
      actor_id: userId,
      metadata: {
        currentCount: index.countForUser(userId),
      },
    });
  }
}

// ------------------------------------------------------------------
// Incremental Sync Integration
// ------------------------------------------------------------------
export async function onNewEmail(userId: string, email: Partial<SearchableMessage>): Promise<void> {
  const indexer = new SearchIndexer();
  await indexer.indexEmail(userId, email);
}

export async function onDeletedEmail(userId: string, uid: number): Promise<void> {
  const indexer = new SearchIndexer();
  await indexer.removeFromIndex(userId, uid);
}

export async function onMovedEmail(
  userId: string,
  uid: number,
  newFolder: string
): Promise<void> {
  const indexer = new SearchIndexer();

  // Remove old index entry and re-index with new folder
  await indexer.removeFromIndex(userId, uid);

  const allForUser = index.getAllForUser(userId);
  const oldEntry = allForUser.find((m) => m.uid === uid);

  if (oldEntry) {
    await indexer.indexEmail(userId, { ...oldEntry, folder: newFolder });
  }
}

// Export helpers for testing
export { tokenize, filterStopWords, stem };