// ============================================================================
// Crux-Webmail — IMAP Service (node-imap + mailparser)
// ============================================================================
// Cliente IMAP real contra Dovecot. La autenticación usa un MASTER USER de
// Dovecot: el `account.username` ya viene como `usuario@dominio*masteruser`
// y `account.password` es la master password (ver email.controller →
// buildImapAccount). Pool por usuario + circuit breaker.
// ============================================================================

import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { auditLogger } from 'utils/audit-logger';
import { CruxError } from 'errors/handler';
import { config } from '../../config/app.config';
import { buildMailTlsOptions } from './mail-tls';

export interface IMAPAccount {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  tls: boolean;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

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

export interface FolderInfo {
  name: string;
  delimiter: string;
  flags: string[];
  specialUse: string[];
}

// ------------------------------------------------------------------
// Circuit breaker
// ------------------------------------------------------------------
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
    auditLogger.warn('Circuit breaker OPEN', { actor_id: id, metadata: { failures: c.failures } as any });
  }
}

// ------------------------------------------------------------------
// Connection pool
// ------------------------------------------------------------------
const connectionPool = new Map<string, { conn: Imap; status: ConnectionStatus; lastActivity: number }>();
// Conexiones en curso: dedup para que N requests concurrentes (el webmail abre
// varias carpetas a la vez al cargar) compartan UNA conexión en vez de abrir
// una cada una (race que saturaba Dovecot y dejaba conexiones huérfanas).
const connecting = new Map<string, Promise<Imap>>();

export async function connectIMAP(account: IMAPAccount): Promise<Imap> {
  return new Promise((resolve, reject) => {
    const conn = new Imap({
      user: account.username,
      password: account.password,
      host: account.host,
      port: account.port,
      tls: account.tls,
      // Zero-Trust: validar el cert de Dovecot contra la CA interna + mTLS.
      tlsOptions: buildMailTlsOptions(config.DOVECOT_TLS_SERVERNAME),
      authTimeout: 20_000,
      connTimeout: 15_000,
      keepalive: true,
    });

    let settled = false;

    conn.once('ready', () => {
      if (settled) return;
      settled = true;
      auditLogger.info('IMAP connected', { actor_id: account.id, metadata: { host: account.host } as any });
      connectionPool.set(account.id, { conn, status: 'connected', lastActivity: Date.now() });
      circuitRecordSuccess(account.id);
      resolve(conn);
    });

    conn.once('error', (err: Error) => {
      if (settled) return;
      settled = true;
      auditLogger.error('IMAP connection error', { actor_id: account.id, metadata: { host: account.host, error: String(err?.message || err) } as any });
      connectionPool.delete(account.id);
      circuitRecordFailure(account.id);
      reject(err);
    });

    // Limpiar el pool si la conexión se cierra de forma inesperada.
    conn.once('end', () => {
      const entry = connectionPool.get(account.id);
      if (entry && entry.conn === conn) connectionPool.delete(account.id);
    });

    conn.connect();
  });
}

async function getIMAPConnection(account: IMAPAccount): Promise<Imap> {
  if (!circuitAllow(account.id)) {
    throw new CruxError('IMAP_CIRCUIT_OPEN', 'IMAP service temporarily unavailable');
  }

  // Reusar sólo si la conexión está REALMENTE viva y autenticada. node-imap
  // expone `state`: 'authenticated' es el único estado seguro para operar;
  // si quedó 'disconnected'/'connected' la descartamos (evita "Not authenticated").
  const entry = connectionPool.get(account.id);
  if (entry && (entry.conn as any).state === 'authenticated') {
    entry.lastActivity = Date.now();
    return entry.conn;
  }
  if (entry) {
    try { entry.conn.end(); } catch { /* ignore */ }
    connectionPool.delete(account.id);
  }

  // Dedup: si ya hay una conexión abriéndose para esta cuenta, esperamos esa
  // misma promesa en vez de abrir otra (evita la race de N conexiones simultáneas).
  const inflight = connecting.get(account.id);
  if (inflight) return inflight;

  const attemptConnect = (async () => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { return await connectIMAP(account); } catch (err) {
        lastErr = err;
        if (attempt === 3) break;
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('IMAP connection failed after retries');
  })();

  connecting.set(account.id, attemptConnect);
  try {
    return await attemptConnect;
  } finally {
    connecting.delete(account.id);
  }
}

// ------------------------------------------------------------------
// Serialización por cuenta — node-imap usa UNA conexión y no soporta comandos
// concurrentes (un SELECT cambia el buzón activo; si dos operaciones corren a
// la vez se pisan o se cuelgan). El webmail abre varias carpetas al cargar, así
// que encolamos: cada operación (openBox + search/fetch) corre completa antes
// de empezar la siguiente sobre la misma conexión.
// ------------------------------------------------------------------
const opLocks = new Map<string, Promise<unknown>>();

function withConnection<T>(account: IMAPAccount, fn: (conn: Imap) => Promise<T>): Promise<T> {
  const prev = (opLocks.get(account.id) ?? Promise.resolve()) as Promise<unknown>;
  const run = prev.then(
    () => getIMAPConnection(account).then(fn),
    () => getIMAPConnection(account).then(fn),
  );
  // El siguiente en la cola espera a que éste termine (éxito o error).
  opLocks.set(account.id, run.then(() => undefined, () => undefined));
  return run;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function openBox(conn: Imap, folder: string, readOnly: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.openBox(folder || 'INBOX', readOnly, (err) => (err ? reject(err) : resolve()));
  });
}

// Flags de atributos de carpeta que NO son special-use (estructura).
const STRUCTURAL_ATTRIBS = new Set(['\\HasChildren', '\\HasNoChildren', '\\Noselect', '\\Noinferiors', '\\Marked', '\\Unmarked', '\\Subscribed']);

function flattenBoxes(boxes: Record<string, any> | null, prefix = '', delimiter = '/'): FolderInfo[] {
  if (!boxes) return [];
  const out: FolderInfo[] = [];
  for (const [name, box] of Object.entries(boxes)) {
    const delim = box?.delimiter || delimiter;
    const fullName = prefix ? `${prefix}${delim}${name}` : name;
    const attribs: string[] = Array.isArray(box?.attribs) ? box.attribs : [];
    out.push({
      name: fullName,
      delimiter: delim,
      flags: attribs,
      specialUse: attribs.filter((a) => !STRUCTURAL_ATTRIBS.has(a)),
    });
    if (box?.children) {
      out.push(...flattenBoxes(box.children, fullName, delim));
    }
  }
  return out;
}

function parseAddrList(raw?: string[]): { address: string; name?: string }[] {
  // Imap.parseHeader devuelve cada campo como array de strings crudos.
  if (!raw || !raw.length) return [];
  const joined = raw.join(', ');
  // Split simple por comas de nivel superior (suficiente para listas estándar).
  return joined
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
      if (m) return { address: m[2].trim(), name: m[1].trim() || undefined };
      return { address: part.replace(/[<>]/g, '').trim() };
    });
}

function mapParsedAddr(v?: { value: { name: string; address: string }[] }): { address: string; name?: string }[] {
  if (!v?.value) return [];
  return v.value
    .filter((a) => a.address)
    .map((a) => ({ address: a.address, name: a.name || undefined }));
}

// ------------------------------------------------------------------
// Folders
// ------------------------------------------------------------------
export async function listFolders(_userId: string, account: IMAPAccount): Promise<FolderInfo[]> {
  return withConnection(account, (conn) => new Promise<FolderInfo[]>((resolve, reject) => {
    conn.getBoxes((err, boxes) => {
      if (err) return reject(err);
      resolve(flattenBoxes(boxes as any));
    });
  }));
}

// ------------------------------------------------------------------
// Search + list (cursor por UID, más nuevo primero)
// ------------------------------------------------------------------
function buildCriteria(query: SearchQuery): Array<string | (string | number)[]> {
  const c: Array<string | (string | number)[]> = [];
  if (query.unread) c.push('UNSEEN'); else c.push('ALL');
  if (query.flagged) c.push('FLAGGED');
  if (query.since) c.push(['SINCE', query.since]);
  if (query.until) c.push(['BEFORE', query.until]);
  if (query.from) c.push(['FROM', query.from]);
  if (query.to) c.push(['TO', query.to]);
  if (query.subject) c.push(['SUBJECT', query.subject]);
  return c;
}

function fetchEnvelopes(conn: Imap, uids: number[]): Promise<EmailMessage[]> {
  if (!uids.length) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const results: EmailMessage[] = [];
    const f = conn.fetch(uids, {
      bodies: 'HEADER.FIELDS (FROM TO CC SUBJECT DATE)',
      struct: true,
    });

    f.on('message', (msg: any) => {
      const item: EmailMessage = {
        uid: 0, subject: '(No Subject)', from: [], to: [], cc: [],
        date: new Date().toISOString(), hasAttachments: false, flags: [],
      };
      let headerBuf = '';

      msg.on('body', (stream: NodeJS.ReadableStream) => {
        stream.on('data', (chunk: Buffer) => { headerBuf += chunk.toString('utf8'); });
      });

      msg.once('attributes', (attrs: any) => {
        item.uid = attrs.uid || 0;
        item.flags = Array.isArray(attrs.flags) ? attrs.flags : [];
        item.hasAttachments = structHasAttachments(attrs.struct);
      });

      msg.once('end', () => {
        try {
          const h = Imap.parseHeader(headerBuf);
          item.subject = h.subject?.[0] || '(No Subject)';
          item.from = parseAddrList(h.from);
          item.to = parseAddrList(h.to);
          item.cc = parseAddrList(h.cc);
          if (h.date?.[0]) {
            const d = new Date(h.date[0]);
            if (!isNaN(d.getTime())) item.date = d.toISOString();
          }
        } catch { /* deja defaults */ }
        results.push(item);
      });
    });

    f.once('error', reject);
    f.once('end', () => resolve(results));
  });
}

function structHasAttachments(struct: any[] | undefined): boolean {
  if (!Array.isArray(struct)) return false;
  for (const part of struct) {
    if (Array.isArray(part)) {
      if (structHasAttachments(part)) return true;
    } else if (part && typeof part === 'object') {
      const disp = part.disposition?.type?.toLowerCase?.();
      if (disp === 'attachment') return true;
    }
  }
  return false;
}

export async function searchEmailsWithPagination(
  _userId: string,
  account: IMAPAccount,
  query: SearchQuery,
  cursor?: string,
  limit = 20
): Promise<{ items: EmailMessage[]; total: number; nextCursor: string | null; prevCursor: string | null }> {
  return withConnection(account, async (conn) => {
  const folder = query.folder || 'INBOX';
  await openBox(conn, folder, true);

  const criteria = buildCriteria(query);

  const allUids: number[] = await new Promise((resolve, reject) => {
    conn.search(criteria, (err, uids) => (err ? reject(err) : resolve(uids || [])));
  });

  // Más nuevo primero (UID mayor = más reciente).
  const sorted = allUids.slice().sort((a, b) => b - a);

  // Cursor = último UID de la página anterior; tomamos los UID menores que él.
  let startIdx = 0;
  if (cursor) {
    const cursorUid = parseInt(cursor, 10);
    const at = sorted.findIndex((u) => u < cursorUid);
    startIdx = at === -1 ? sorted.length : at;
  }

  const pageUids = sorted.slice(startIdx, startIdx + limit);
  const items = (await fetchEnvelopes(conn, pageUids))
    .sort((a, b) => b.uid - a.uid);

  const hasNext = startIdx + limit < sorted.length;
  const lastUid = pageUids[pageUids.length - 1];

  return {
    items,
    total: sorted.length,
    nextCursor: hasNext && lastUid != null ? String(lastUid) : null,
    prevCursor: null,
  };
  });
}

// Compat: listado simple (usado por sync u otros callers).
export async function fetchEmails(
  _userId: string,
  account: IMAPAccount,
  folder = 'INBOX',
  search?: { since?: string; unread?: boolean }
): Promise<EmailMessage[]> {
  const res = await searchEmailsWithPagination(_userId, account, {
    folder,
    since: search?.since,
    unread: search?.unread,
  }, undefined, 50);
  return res.items;
}

// ------------------------------------------------------------------
// Single message (cuerpo completo via mailparser)
// ------------------------------------------------------------------
export async function fetchEmailByUID(_userId: string, account: IMAPAccount, folder: string, uid: number): Promise<EmailMessage | null> {
  return withConnection(account, async (conn) => {
  await openBox(conn, folder || 'INBOX', true);

  return new Promise<EmailMessage | null>((resolve, reject) => {
    let raw = '';
    let flags: string[] = [];
    let found = false;

    const f = conn.fetch(uid, { bodies: '', struct: true });

    f.on('message', (msg: any) => {
      found = true;
      msg.on('body', (stream: NodeJS.ReadableStream) => {
        stream.on('data', (chunk: Buffer) => { raw += chunk.toString('utf8'); });
      });
      msg.once('attributes', (attrs: any) => {
        flags = Array.isArray(attrs.flags) ? attrs.flags : [];
      });
    });

    f.once('error', reject);
    f.once('end', async () => {
      if (!found || !raw) return resolve(null);
      try {
        const parsed = await simpleParser(raw);
        resolve({
          uid,
          subject: parsed.subject || '(No Subject)',
          from: mapParsedAddr(parsed.from),
          to: mapParsedAddr(parsed.to),
          cc: mapParsedAddr(parsed.cc),
          date: parsed.date instanceof Date ? parsed.date.toISOString() : new Date().toISOString(),
          text: parsed.text || undefined,
          html: typeof parsed.html === 'string' ? parsed.html : undefined,
          hasAttachments: Array.isArray(parsed.attachments) && parsed.attachments.length > 0,
          flags,
        });
      } catch (err) {
        reject(err);
      }
    });
  });
  });
}

// ------------------------------------------------------------------
// Flags / delete / move
// ------------------------------------------------------------------
const FLAG_MAP: Record<string, string> = {
  SEEN: '\\Seen',
  FLAGGED: '\\Flagged',
  DELETED: '\\Deleted',
};

export async function markEmailFlag(
  _userId: string,
  account: IMAPAccount,
  folder: string,
  uid: number,
  flag: 'SEEN' | 'UNSEEN' | 'FLAGGED' | 'UNFLAGGED' | 'DELETED'
): Promise<void> {
  return withConnection(account, async (conn) => {
  await openBox(conn, folder || 'INBOX', false);

  const remove = flag === 'UNSEEN' || flag === 'UNFLAGGED';
  const imapFlag = remove
    ? (flag === 'UNSEEN' ? '\\Seen' : '\\Flagged')
    : FLAG_MAP[flag];

  return new Promise<void>((resolve, reject) => {
    const cb = (err: Error | null) => (err ? reject(err) : resolve());
    if (remove) conn.delFlags(uid, [imapFlag], cb);
    else conn.addFlags(uid, [imapFlag], cb);
  });
  });
}

export async function deleteEmail(_userId: string, account: IMAPAccount, folder: string, uid: number): Promise<void> {
  return withConnection(account, async (conn) => {
  await openBox(conn, folder || 'INBOX', false);

  await new Promise<void>((resolve, reject) => {
    conn.addFlags(uid, ['\\Deleted'], (err) => (err ? reject(err) : resolve()));
  });
  await new Promise<void>((resolve, reject) => {
    conn.expunge(uid, (err) => (err ? reject(err) : resolve()));
  });
  });
}

export async function moveEmail(_userId: string, account: IMAPAccount, fromFolder: string, toFolder: string, uid: number): Promise<void> {
  return withConnection(account, async (conn) => {
  await openBox(conn, fromFolder || 'INBOX', false);
  await new Promise<void>((resolve, reject) => {
    conn.move(uid, toFolder || 'INBOX', (err) => (err ? reject(err) : resolve()));
  });
  });
}

// ------------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------------
export async function disconnectIMAP(userId: string): Promise<void> {
  const entry = connectionPool.get(userId);
  if (entry) {
    try { entry.conn.end(); } catch { /* ignore */ }
    connectionPool.delete(userId);
    auditLogger.info('IMAP disconnected', { actor_id: userId });
  }
}

export function getIMAPStatus(userId: string): ConnectionStatus {
  const e = connectionPool.get(userId);
  return e ? e.status : 'idle';
}

const IDLE_TIMEOUT_MS = 600_000;

export function startIdleCleanup(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of connectionPool.entries()) {
      if (now - entry.lastActivity > IDLE_TIMEOUT_MS) {
        try { entry.conn.end(); } catch { /* ignore */ }
        connectionPool.delete(id);
        auditLogger.info('IMAP idle cleanup', { actor_id: id });
      }
    }
  }, 300_000);
}
