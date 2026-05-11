// Crux-Webmail — IMAP Service (simple-imap)

import simpleImapModule from 'simple-imap';
import { auditLogger } from 'utils/audit-logger';
import type { CruxError } from 'errors/handler';

const SimpleImap: any = (simpleImapModule as any).SimpleImap || (simpleImapModule as any).default;

export interface IMAPAccount {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  tls: boolean;
}

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface EmailMessage {
  uid: number;
  subject: string;
  from: { address: string; name?: string }[];
  to:   { address: string; name?: string }[];
  cc:   { address: string; name?: string }[];
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

interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: number;
  resetTimeout: number;
  threshold: number;
}

const CIRCUIT_STATES = new Map<string, CircuitState>();
const MAX_FAILURES = 5;
const RESET_TIMEOUT_MS = 30_000;

function getCircuit(id: string): CircuitState {
  let c = CIRCUIT_STATES.get(id);
  if (!c) {
    c = { state: 'closed', failures: 0, lastFailure: 0, threshold: MAX_FAILURES, resetTimeout: RESET_TIMEOUT_MS };
    CIRCUIT_STATES.set(id, c);
  }
  return c;
}

function circuitAllow(id: string): boolean {
  const cs = getCircuit(id);
  if (cs.state === 'open' && Date.now() - cs.lastFailure < cs.resetTimeout) return false;
  if (cs.state === 'open') cs.state = 'half-open';
  return true;
}

function circuitRecordSuccess(id: string) { const c = getCircuit(id); c.failures = 0; c.state = 'closed'; }
function circuitRecordFailure(id: string) {
  const c = getCircuit(id); c.lastFailure = Date.now(); c.failures++;
  if (c.failures >= c.threshold && c.state !== 'open') {
    c.state = 'open';
    auditLogger.warn('Circuit breaker OPEN', { actor_id: id, failures: c.failures });
  }
}

const connectionPool = new Map<string, { conn: any; status: ConnectionStatus; lastActivity: number }>();

export async function connectIMAP(account: IMAPAccount): Promise<any> {
  return new Promise((resolve, reject) => {
    const conn = new SimpleImap({
      user: account.username,
      password: account.password,
      host: account.host,
      port: account.port,
      tls: account.tls,
      authTimeout: 20_000,
      connTimeout: 15_000,
    });

    conn.once('ready', () => {
      auditLogger.info('IMAP connected', { actor_id: account.id, host: account.host });
      connectionPool.set(account.id, { conn, status: 'connected', lastActivity: Date.now() });
      circuitRecordSuccess(account.id);
      resolve(conn);
    });

    conn.once('error', (err: any) => {
      auditLogger.error('IMAP connection error', { actor_id: account.id, host: account.host, error: err?.message || err });
      connectionPool.delete(account.id);
      circuitRecordFailure(account.id);
      reject(err);
    });

    conn.connect();
  });
}

async function getIMAPConnection(account: IMAPAccount): Promise<any> {
  if (!circuitAllow(account.id)) {
    throw new (CruxError || Error)('IMAP_CIRCUIT_OPEN', 'IMAP service temporarily unavailable');
  }

  const entry = connectionPool.get(account.id);
  if (entry && entry.status === 'connected') {
    entry.lastActivity = Date.now();
    return entry.conn;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await connectIMAP(account); } catch (err: any) {
      circuitRecordFailure(account.id);
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  throw new Error('IMAP connection failed after retries');
}

export async function listFolders(_userId: string, account: IMAPAccount): Promise<any[]> {
  const conn = await getIMAPConnection(account);
  return new Promise((resolve, reject) => {
    conn.listFolders((err: any, folders: any[]) => (err ? reject(err) : resolve(folders)));
  });
}

function parseAddr(a: any): { address: string; name?: string } | null {
  if (!a || typeof a === 'string') return a ? { address: a.trim(), name: undefined } : null;
  const addr = (typeof a.address === 'string' && a.address !== '') ? a.address.trim() : undefined;
  if (!addr) return null;
  const name = typeof a.name === 'string' && a.name?.trim() ? a.name.trim() : undefined;
  return { address: addr, name };
}

function normalizeMsg(msg: any): EmailMessage {
  const attrs = msg.attributes || {};
  const parts = Array.isArray(msg.parts) ? msg.parts : [];

  const textPart = parts.find((p: any) => p.which === 'text');
  const htmlPart = parts.find((p: any) => p.which === 'html');

  return {
    uid: attrs.uid || 0,
    subject: attrs.subject || '(No Subject)',
    from: (attrs.from || []).map(parseAddr).filter(Boolean) as Array<{ address: string; name?: string }>,
    to:   (attrs.to || []).map(parseAddr).filter(Boolean) as Array<{ address: string; name?: string }>,
    cc:   (attrs.cc || []).map(parseAddr).filter(Boolean) as Array<{ address: string; name?: string }>,
    date: attrs.date instanceof Date ? attrs.date.toISOString() : new Date().toISOString(),
    text: typeof textPart?.source === 'string' ? textPart.source : undefined,
    html: typeof htmlPart?.source === 'string' ? htmlPart.source : undefined,
    hasAttachments: Array.isArray(attrs.attachments) && attrs.attachments.length > 0,
    flags: Array.isArray(attrs.flags) ? attrs.flags : [],
  };
}

export async function fetchEmails(
  _userId: string,
  account: IMAPAccount,
  folder = 'INBOX',
  search?: { since?: string; unread?: boolean }
): Promise<EmailMessage[]> {
  const conn = await getIMAPConnection(account);

  const query: any[] = [];
  if (search?.unread) query.push('UNSEEN'); else query.push('ALL');
  if (search?.since) query.push(`SINCE ${search.since}`);

  return new Promise((resolve, reject) => {
    conn.fetch({ box: folder || 'INBOX', search: query }, { body: true, b: { from: true, to: true, cc: true, subject: true, date: true, flags: true, attachments: true } }, (err: any, msgOrMsgs: any) => {
      if (err) return reject(err);
      const msgs = Array.isArray(msgOrMsgs) ? msgOrMsgs : [msgOrMsgs];
      resolve(msgs.map(normalizeMsg));
    });
  });
}

export async function fetchEmailByUID(_userId: string, account: IMAPAccount, folder: string, uid: number): Promise<EmailMessage | null> {
  const conn = await getIMAPConnection(account);

  return new Promise((resolve, reject) => {
    conn.fetch({ box: folder || 'INBOX', uid }, { body: true, b: { from: true, to: true, cc: true, subject: true, date: true, flags: true, attachments: true } }, (err: any, msgOrMsgs: any) => {
      if (err) return reject(err);
      const msgs = Array.isArray(msgOrMsgs) ? msgOrMsgs : [msgOrMsgs];
      const first = msgs[0];
      if (!first || !first.attributes || !first.attributes.uid) return resolve(null);
      resolve(normalizeMsg(first));
    });
  });
}

export async function searchEmailsWithPagination(
  _userId: string,
  account: IMAPAccount,
  query: SearchQuery,
  cursor?: string,
  limit = 20
): Promise<{ items: EmailMessage[]; total: number; nextCursor: string | null; prevCursor: string | null }> {
  const conn = await getIMAPConnection(account);
  const folder = query.folder || 'INBOX';

  const params: any[] = [];
  if (query.unread) params.push('UNSEEN'); else params.push('ALL');
  if (query.flagged) params.push('FLAGGED');
  if (query.since) params.push(`SINCE ${query.since}`);
  if (query.until) params.push(`BEFORE ${query.until}`);
  if (query.from)  params.push(`FROM ${query.from}`);
  if (query.to)    params.push(`TO ${query.to}`);
  if (query.subject) params.push(`SUBJECT ${query.subject}`);

  if (cursor) {
    const direction = cursor.startsWith('-') ? 'prev' : 'next';
    const baseUid = parseInt(cursor.replace(/^-/, ''), 10);
    const filter = direction === 'next'
      ? `UID ${baseUid + 1}:*`
      : `UID 1:${Math.max(baseUid - 1, 1)}`;
    params.push(filter);
  }

  return new Promise((resolve, reject) => {
    conn.fetch({ box: folder || 'INBOX', search: params }, { body: true, b: { from: true, to: true, cc: true, subject: true, date: true, flags: true, attachments: true } }, (err: any, msgOrMsgs: any) => {
      if (err) return reject(err);
      const msgs = Array.isArray(msgOrMsgs) ? msgOrMsgs : [msgOrMsgs];
      const itemsAll = msgs.map(normalizeMsg).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (!itemsAll.length) {
        return resolve({ items: [], total: 0, nextCursor: null, prevCursor: null });
      }

      const paginated = itemsAll.slice(0, limit);
      const firstUid = paginated[0]?.uid ?? null;
      const lastUid = paginated[paginated.length - 1]?.uid ?? null;

      resolve({
        items: paginated,
        total: itemsAll.length,
        nextCursor: itemsAll.length > limit ? String(firstUid) : null,
        prevCursor: lastUid != null && lastUid > 1 ? `-${lastUid}` : null,
      });
    });
  });
}

export async function markEmailFlag(
  _userId: string,
  account: IMAPAccount,
  folder: string,
  uid: number,
  flag: 'SEEN' | 'UNSEEN' | 'FLAGGED' | 'UNFLAGGED' | 'DELETED'
): Promise<void> {
  const conn = await getIMAPConnection(account);

  return new Promise((resolve, reject) => {
    let mode = '+';
    let flagValue: string | null = flag;

    if (flag === 'UNSEEN')      { mode = '-';   flagValue = '\\Seen'; }
    if (flag === 'UNFLAGGED')   { mode = '-';   flagValue = '\\Flagged'; }
    if (flag === 'DELETED')     { mode = '+';   flagValue = '\\Deleted'; }

    conn.updateFlags(
      { box: folder || 'INBOX', uid },
      { [mode + 'Flags']: [flagValue] as any[] },
      (err: any) => { if (err) reject(err); else resolve(); }
    );
  });
}

export async function deleteEmail(_userId: string, account: IMAPAccount, folder: string, uid: number): Promise<void> {
  const conn = await getIMAPConnection(account);
  return new Promise((resolve, reject) => {
    // Mark as deleted; many servers handle expunge on logout.
    conn.updateFlags(
      { box: folder || 'INBOX', uid },
      { '+FLAGS': ['\\Deleted'] },
      (err: any) => { if (err) return reject(err); resolve(); }
    );
  });
}

export async function moveEmail(_userId: string, account: IMAPAccount, fromFolder: string, toFolder: string, uid: number): Promise<void> {
  const conn = await getIMAPConnection(account);
  // Fallback: copy then delete if no move.
  try {
    return await new Promise((resolve, reject) => {
      (conn as any).move(
        { box: fromFolder || 'INBOX', uid },
        { to: toFolder },
        (err: any) => { if (!err) return resolve(); reject(err); }
      );
    });
  } catch (_) {
    // Manual fallback.
    await new Promise<void>((rs, rj) => {
      conn.copy(
        { box: fromFolder || 'INBOX', uid },
        toFolder || 'INBOX',
        (err: any) => { if (err) return rj(err); rs(); }
      );
    });
    await deleteEmail(_userId, account, fromFolder || 'INBOX', uid);
  }
}

export async function disconnectIMAP(userId: string): Promise<void> {
  const entry = connectionPool.get(userId);
  if (entry) {
    try { (entry.conn as any).end?.(); } catch {/*ignore*/}
    connectionPool.delete(userId);
    auditLogger.info('IMAP disconnected', { actor_id: userId });
  }
}

export function getIMAPStatus(userId: string): ConnectionStatus {
  const e = connectionPool.get(userId);
  return e ? e.status : 'idle';
}

const IDLE_TIMEOUT_MS = 600_000;
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of connectionPool.entries()) {
    if (now - entry.lastActivity > IDLE_TIMEOUT_MS) {
      try { (entry.conn as any).end?.(); } catch {/*ignore*/}
      connectionPool.delete(id);
      auditLogger.info('IMAP idle cleanup', { actor_id: id });
    }
  }
}, 300_000);