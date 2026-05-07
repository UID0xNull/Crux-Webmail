// ============================================================================
// Crux-Webmail — IMAP Service (Simple-IMAP)
// ============================================================================
// Conecta a servidores IMAP, maneja auth, list folder, fetch emails.
// Implementa connection pooling, circuit breaker, retry con backoff.
// Zero-Trust: cada operación auditable + timeout estricto.
// ============================================================================

import SimpleIMAP from 'simple-imap';
import { auditLogger } from '../../utils/audit-logger';
import { CruxError } from '../../errors/handler';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface IMAPAccount {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  tls: boolean;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface ConnectionEntry {
  connection: SimpleIMAP;
  status: ConnectionStatus;
  lastActivity: number;
}

export interface EmailMessage {
  uid: number;
  subject: string;
  from: { address: string; name?: string }[];
  to: { address: string; name?: string }[];
  date: string;
  text?: string;
  html?: string;
  hasAttachments: boolean;
  flags: string[];
}

export interface SearchQuery {
  folder?: string;
  since?: string;
  until?: string;
  from?: string;
  to?: string;
  subject?: string;
  unread?: boolean;
  flagged?: boolean;
  hasAttachments?: boolean;
}

export interface PaginatedEmails {
  items: EmailMessage[];
  total: number;
  nextCursor: string | null;
  prevCursor: string | null;
}

// ------------------------------------------------------------------
// Circuit Breaker State
// ------------------------------------------------------------------

const CIRCUIT_STATES = new Map<string, {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: number;
  threshold: number;
  resetTimeout: number;
}>();

const MAX_FAILURES = 5;
const RESET_TIMEOUT_MS = 30_000;

function getCircuitState(accountId: string) {
  let circuit = CIRCUIT_STATES.get(accountId);
  if (!circuit) {
    circuit = {
      state: 'closed',
      failures: 0,
      lastFailure: 0,
      threshold: MAX_FAILURES,
      resetTimeout: RESET_TIMEOUT_MS,
    };
    CIRCUIT_STATES.set(accountId, circuit);
  }
  return circuit;
}

function circuitAllow(accountId: string): boolean {
  const circuit = getCircuitState(accountId);

  if (circuit.state === 'open') {
    if (Date.now() - circuit.lastFailure > circuit.resetTimeout) {
      circuit.state = 'half-open';
      auditLogger.info('Circuit breaker half-open', {
        actor_id: accountId,
        metadata: { host: 'IMAP' },
      });
      return true;
    }
    return false;
  }
  return true;
}

function circuitRecordSuccess(accountId: string) {
  const circuit = getCircuitState(accountId);
  circuit.failures = 0;
  circuit.state = 'closed';
}

function circuitRecordFailure(accountId: string) {
  const circuit = getCircuitState(accountId);
  circuit.failures += 1;
  circuit.lastFailure = Date.now();

  if (circuit.failures >= circuit.threshold) {
    circuit.state = 'open';
    auditLogger.warn('Circuit breaker OPEN', {
      actor_id: accountId,
      metadata: { failures: circuit.failures },
    });
  }
}

// ------------------------------------------------------------------
// Connection Pool (in-memory)
// ------------------------------------------------------------------

const connectionPool = new Map<string, ConnectionEntry>();

// ------------------------------------------------------------------
// Connect to IMAP server
// ------------------------------------------------------------------

async function connectIMAP(account: IMAPAccount): Promise<SimpleIMAP> {
  return new Promise((resolve, reject) => {
    const conn = new SimpleIMAP({
      user: account.username,
      password: account.password,
      host: account.host,
      port: account.port,
      tls: account.tls,
      authTimeout: 20_000,
      connTimeout: 10_000,
    });

    conn.once('ready', () => {
      auditLogger.info('IMAP connected', {
        actor_id: account.id,
        metadata: { host: account.host },
      });
      connectionPool.set(account.id, {
        connection: conn,
        status: 'connected',
        lastActivity: Date.now(),
      });
      circuitRecordSuccess(account.id);
      resolve(conn);
    });

    conn.once('error', (err: Error) => {
      auditLogger.error('IMAP connection error', {
        actor_id: account.id,
        metadata: { host: account.host, error: err.message },
      });
      connectionPool.delete(account.id);
      circuitRecordFailure(account.id);
      reject(err);
    });

    conn.connect();
  });
}

// ------------------------------------------------------------------
// Get or create connection (with circuit breaker + retry)
// ------------------------------------------------------------------

async function getIMAPConnection(account: IMAPAccount): Promise<SimpleIMAP> {
  if (!circuitAllow(account.id)) {
    throw new CruxError(
      'IMAP_CIRCUIT_OPEN',
      'IMAP service temporarily unavailable (circuit breaker open)',
    );
  }

  const existing = connectionPool.get(account.id);
  if (existing && existing.status === 'connected') {
    existing.lastActivity = Date.now();
    return existing.connection;
  }

  // Retry logic with exponential backoff
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await connectIMAP(account);
    } catch (err) {
      circuitRecordFailure(account.id);
      auditLogger.warn(`IMAP reconnect attempt ${attempt} failed`, {
        actor_id: account.id,
        metadata: { error: (err as Error).message },
      });
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
  throw new Error('IMAP connection failed after retries');
}

// ------------------------------------------------------------------
// List folders
// ------------------------------------------------------------------

export async function listFolders(userId: string, account: IMAPAccount): Promise<any[]> {
  const conn = await getIMAPConnection(account);
  return new Promise((resolve, reject) => {
    conn.listFolders((err: Error | null, folders: any[]) => {
      if (err) reject(err);
      else resolve(folders);
    });
  });
}

// ------------------------------------------------------------------
// Fetch emails from folder
// ------------------------------------------------------------------

export async function fetchEmails(
  userId: string,
  account: IMAPAccount,
  folder: string = 'INBOX',
  search: { since?: string; unread?: boolean } = {},
): Promise<EmailMessage[]> {
  const conn = await getIMAPConnection(account);

  const searchQuery: any[] = [];
  if (search.unread) searchQuery.push('UNSEEN');
  if (search.since) searchQuery.push(`SINCE ${search.since}`);
  if (searchQuery.length === 0) searchQuery.push('ALL');

  return new Promise((resolve, reject) => {
    conn.fetch({
      box: folder,
      search: searchQuery,
      markSeen: false,
    }, {
      body: true,
      b: {
        from: true,
        to: true,
        subject: true,
        date: true,
        cc: true,
        flags: true,
        attachments: true,
      },
    }, (err: Error | null, email: any) => {
      if (err) {
        auditLogger.error('IMAP fetch error', {
          actor_id: userId,
          metadata: { folder, error: err.message },
        });
        reject(err);
        return;
      }

      const messages: EmailMessage[] = [];
      const emails = Array.isArray(email) ? email : [email];

      for (const msg of emails) {
        messages.push({
          uid: msg.attributes?.uid || 0,
          subject: msg.attributes?.subject || '(No Subject)',
          from: msg.attributes?.from || [],
          to: msg.attributes?.to || [],
          date: msg.attributes?.date?.toISOString() || new Date().toISOString(),
          text: msg.parts?.find((p: any) => p.which === 'text')?.source || '',
          html: msg.parts?.find((p: any) => p.which === 'html')?.source || '',
          hasAttachments: msg.attributes?.attachments?.length > 0 || false,
          flags: msg.attributes?.flags || [],
        });
      }

      resolve(messages);
    });
  });
}

// ------------------------------------------------------------------
// Fetch single email by UID
// ------------------------------------------------------------------

export async function fetchEmailByUID(
  userId: string,
  account: IMAPAccount,
  folder: string,
  uid: number,
): Promise<EmailMessage | null> {
  const conn = await getIMAPConnection(account);

  return new Promise((resolve, reject) => {
    conn.fetch({
      box: folder,
      uid: uid,
    }, {
      body: true,
      b: {
        from: true,
        to: true,
        subject: true,
        date: true,
        cc: true,
        flags: true,
        attachments: true,
      },
    }, (err: Error | null, email: any) => {
      if (err) {
        auditLogger.error('IMAP fetch by UID error', {
          actor_id: userId,
          metadata: { uid, folder, error: err.message },
        });
        reject(err);
        return;
      }

      resolve({
        uid: email.attributes?.uid || uid,
        subject: email.attributes?.subject || '(No Subject)',
        from: email.attributes?.from || [],
        to: email.attributes?.to || [],
        date: email.attributes?.date?.toISOString() || new Date().toISOString(),
        text: email.parts?.find((p: any) => p.which === 'text')?.source || '',
        html: email.parts?.find((p: any) => p.which === 'html')?.source || '',
        hasAttachments: email.attributes?.attachments?.length > 0 || false,
        flags: email.attributes?.flags || [],
      });
    });
  });
}

// ------------------------------------------------------------------
// Search with pagination (UID-based cursor)
// ------------------------------------------------------------------

export async function searchEmailsWithPagination(
  userId: string,
  account: IMAPAccount,
  query: SearchQuery,
  cursor?: string,
  limit: number = 20,
): Promise<PaginatedEmails> {
  const conn = await getIMAPConnection(account);
  const folder = query.folder || 'INBOX';

  const searchParams: any[] = [];
  if (query.unread) searchParams.push('UNSEEN');
  else searchParams.push('ALL');
  if (query.flagged) searchParams.push('FLAGGED');
  if (query.since) searchParams.push(`SINCE ${query.since}`);
  if (query.until) searchParams.push(`BEFORE ${query.until}`);
  if (query.from) searchParams.push(`FROM ${query.from}`);
  if (query.to) searchParams.push(`TO ${query.to}`);
  if (query.subject) searchParams.push(`SUBJECT ${query.subject}`);

  // Determine UIDs to fetch based on cursor
  let uidFilter: string[] | undefined;
  if (cursor) {
    const direction = cursor.startsWith('-') ? 'prev' : 'next';
    const baseUid = parseInt(cursor.replace(/^-/, ''), 10);
    uidFilter = direction === 'next'
      ? [`UID ${baseUid + 1}:*`]
      : [`UID 1:${baseUid - 1}`];
  }

  const fullQuery = [...searchParams, ...(uidFilter || [])];

  return new Promise((resolve, reject) => {
    conn.fetch({
      box: folder,
      search: fullQuery,
      markSeen: false,
    }, {
      body: true,
      b: {
        from: true,
        to: true,
        subject: true,
        date: true,
        cc: true,
        flags: true,
        attachments: true,
      },
    }, (err: Error | null, email: any) => {
      if (err) {
        auditLogger.error('IMAP search failed', {
          actor_id: userId,
          metadata: { folder, error: err.message },
        });
        reject(err);
        return;
      }

      const emails = Array.isArray(email) ? email : [email];
      const messages: EmailMessage[] = emails.map((msg) => ({
        uid: msg.attributes?.uid || 0,
        subject: msg.attributes?.subject || '(No Subject)',
        from: msg.attributes?.from || [],
        to: msg.attributes?.to || [],
        date: msg.attributes?.date?.toISOString() || new Date().toISOString(),
        text: '', // Headers only for list
        html: '',
        hasAttachments: msg.attributes?.attachments?.length > 0 || false,
        flags: msg.attributes?.flags || [],
      }));

      // Sort by date descending
      messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const paginated = messages.slice(0, limit);
      const firstUid = paginated.length > 0 ? paginated[0].uid : 0;
      const lastUid = paginated.length > 0 ? paginated[paginated.length - 1].uid : 0;

      resolve({
        items: paginated,
        total: messages.length,
        nextCursor: messages.length > limit ? String(firstUid) : null,
        prevCursor: lastUid > 1 ? `-${lastUid}` : null,
      });
    });
  });
}

// ------------------------------------------------------------------
// Mark email as read/unread/flagged
// ------------------------------------------------------------------

export async function markEmailFlag(
  userId: string,
  account: IMAPAccount,
  folder: string,
  uid: number,
  flag: 'SEEN' | 'UNSEEN' | 'FLAGGED' | 'UNFLAGGED' | 'DELETED',
): Promise<void> {
  const conn = await getIMAPConnection(account);

  return new Promise((resolve, reject) => {
    const mode = (flag === 'UNSEEN' || flag === 'UNFLAGGED') ? '-' : '+';
    const imapFlag = flag === 'UNSEEN' ? '' : flag === 'UNFLAGGED' ? '' : flag === 'DELETED' ? '' : flag;

    conn.updateFlags({
      box: folder,
      uid: uid,
    }, {
      [mode + 'Flags']: [imapFlag],
    }, (err: Error | null) => {
      if (err) {
        auditLogger.error('Failed to update email flag', {
          actor_id: userId,
          metadata: { uid, flag, folder, error: err.message },
        });
        reject(err);
        return;
      }
      auditLogger.info('Email flag updated', {
        actor_id: userId,
        metadata: { uid, flag, folder },
      });
      resolve();
    });
  });
}

// ------------------------------------------------------------------
// Delete email (permanent)
// ------------------------------------------------------------------

export async function deleteEmail(
  userId: string,
  account: IMAPAccount,
  folder: string,
  uid: number,
): Promise<void> {
  const conn = await getIMAPConnection(account);

  return new Promise((resolve, reject) => {
    conn.deleteEmail({
      box: folder,
      uid: uid,
    }, (err: Error | null) => {
      if (err) {
        auditLogger.error('Failed to delete email', {
          actor_id: userId,
          metadata: { uid, folder, error: err.message },
        });
        reject(err);
        return;
      }
      auditLogger.info('Email deleted', {
        actor_id: userId,
        metadata: { uid, folder },
      });
      resolve();
    });
  });
}

// ------------------------------------------------------------------
// Move email to another folder
// ------------------------------------------------------------------

export async function moveEmail(
  userId: string,
  account: IMAPAccount,
  fromFolder: string,
  toFolder: string,
  uid: number,
): Promise<void> {
  const conn = await getIMAPConnection(account);

  return new Promise((resolve, reject) => {
    conn.move({
      box: fromFolder,
      uid: uid,
      to: toFolder,
    }, (err: Error | null) => {
      if (err) {
        auditLogger.error('Failed to move email', {
          actor_id: userId,
          metadata: { uid, from: fromFolder, to: toFolder, error: err.message },
        });
        reject(err);
        return;
      }
      auditLogger.info('Email moved', {
        actor_id: userId,
        metadata: { uid, from: fromFolder, to: toFolder },
      });
      resolve();
    });
  });
}

// ------------------------------------------------------------------
// Disconnect / close connection
// ------------------------------------------------------------------

export async function disconnectIMAP(userId: string): Promise<void> {
  const entry = connectionPool.get(userId);
  if (entry) {
    entry.connection.end();
    connectionPool.delete(userId);
    auditLogger.info('IMAP disconnected', {
      actor_id: userId,
    });
  }
}

// ------------------------------------------------------------------
// Get connection status
// ------------------------------------------------------------------

export function getIMAPStatus(userId: string): ConnectionStatus {
  const entry = connectionPool.get(userId);
  return entry?.status || 'idle';
}

// ------------------------------------------------------------------
// Cleanup idle connections (single global interval)
// ------------------------------------------------------------------

const IDLE_TIMEOUT_MS = 600_000; // 10 min
const CLEANUP_INTERVAL_MS = 300_000; // 5 min

export function startIdleCleanup(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of connectionPool) {
      if (now - entry.lastActivity > IDLE_TIMEOUT_MS) {
        entry.connection.end();
        connectionPool.delete(id);
        auditLogger.info('IMAP idle connection cleaned', {
          actor_id: id,
        });
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

// Start cleanup on module load
startIdleCleanup();