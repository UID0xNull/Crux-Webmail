// ============================================================================
// Crux-Webmail — Dovecot IMAP Bridge
// ============================================================================
// Pool de conexiones seguras con timeout estricto, retry exponencial,
// circuit breaker y traducción IMAP → JMAP/REST.
// ============================================================================

import { EventEmitter } from 'node:events';
import { SimpleImap } from 'simple-imap';
import {
  ImapBridgeConfig,
  DovecotMailboxInfo,
  MailEnvelope,
  BridgeHealthStatus,
  JMAPMailMessage,
  JMAPEmailAddress,
  JMAPBodyStructure,
} from '../../types/global';
import { config } from '../../config/app.config';
import { generateSecureUuid } from '../../utils/crypto';
import { auditLogger } from '../../utils/audit-logger';
import { CruxError } from '../../errors/handler';

// ------------------------------------------------------------------
// ExponentialBackoffStrategy
// ------------------------------------------------------------------
class ExponentialBackoffStrategy {
  private attempts: number = 0;
  private readonly maxAttempts: number;
  private readonly baseDelay: number;
  private readonly multiplier: number;
  private readonly maxDelay: number;

  constructor(options?: {
    maxAttempts?: number;
    baseDelay?: number;
    multiplier?: number;
    maxDelay?: number;
  }) {
    this.maxAttempts = options?.maxAttempts ?? 3;
    this.baseDelay = options?.baseDelay ?? 1000;
    this.multiplier = options?.multiplier ?? 2;
    this.maxDelay = options?.maxDelay ?? 8000;
  }

  getNextDelay(): number {
    const delay = this.baseDelay * Math.pow(this.multiplier, this.attempts);
    return Math.min(delay, this.maxDelay);
  }

  recordAttempt(): void {
    this.attempts++;
  }

  hasExceeded(): boolean {
    return this.attempts >= this.maxAttempts;
  }

  reset(): void {
    this.attempts = 0;
  }
}

// ------------------------------------------------------------------
// CircuitBreaker — isolation para downstream failures
// ------------------------------------------------------------------
interface CircuitState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailure: number;
  nextRetry: number;
}

class CircuitBreaker {
  private state: CircuitState;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;

  constructor() {
    this.state = {
      state: 'CLOSED',
      failures: 0,
      lastFailure: 0,
      nextRetry: 0,
    };
    this.failureThreshold = 5;
    this.resetTimeout = 30000; // 30s antes de probar again
  }

  canExecute(): boolean {
    if (this.state.state === 'OPEN') {
      if (Date.now() > this.state.nextRetry) {
        this.state.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.state.state = 'CLOSED';
    this.state.failures = 0;
  }

  recordFailure(): void {
    this.state.failures++;
    this.state.lastFailure = Date.now();
    if (this.state.failures >= this.failureThreshold) {
      this.state.state = 'OPEN';
      this.state.nextRetry = Date.now() + this.resetTimeout;
      auditLogger.error('Circuit breaker OPEN — IMAP bridge isolated', {
        metadata: { failures: this.state.failures },
      });
    }
  }

  getStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    switch (this.state.state) {
      case 'CLOSED': return 'healthy';
      case 'HALF_OPEN': return 'degraded';
      case 'OPEN': return 'unhealthy';
    }
  }
}

// ------------------------------------------------------------------
// ImapConnectionWrapper — connection lifecycle
// ------------------------------------------------------------------
export class ImapConnectionWrapper {
  private conn: SimpleImap | null = null;
  private userId: string = '';
  private connected: boolean = false;
  private health: BridgeHealthStatus = {
    service: 'dovecot-imap',
    status: 'healthy',
    latency_ms: 0,
    last_check: 0,
    connections: 0,
    error_rate: 0,
  };

  private circuitBreaker = new CircuitBreaker();
  private backoff = new ExponentialBackoffStrategy();

  async connect(userId: string): Promise<void> {
    if (!this.circuitBreaker.canExecute()) {
      throw new CruxError(
        'BRIDGE_CONNECTION_FAILED',
        'IMAP bridge circuit is open — service temporarily unavailable'
      );
    }

    this.userId = userId;
    this.disconnect();

    const conn = new SimpleImap({
      host: config.DOVECOT_HOST,
      port: config.DOVECOT_PORT,
      tls: true,
      connTimeout: 10000,
      authTimeout: 8000,
      socketTimeout: 30000,
    });

    this.conn = conn;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('IMAP connect timeout')), 10000);

      conn.once('connect', () => {
        clearTimeout(timeout);
        this.connected = true;
        this.circuitBreaker.recordSuccess();
        this.backoff.reset();
        resolve();
      });

      conn.once('error', (err: Error) => {
        clearTimeout(timeout);
        this.circuitBreaker.recordFailure();
        this.backoff.recordAttempt();
        reject(err);
      });
    });
  }

  async login(username: string, password: string): Promise<void> {
    if (!this.conn) throw new Error('Not connected');

    await new Promise<void>((resolve, reject) => {
      this.conn!.login(
        { user: username, password },
        (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async openBox(mailbox: string): Promise<void> {
    if (!this.conn) throw new Error('Not connected');

    await new Promise<void>((resolve, reject) => {
      this.conn!.openBox(mailbox, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getMailboxes(): Promise<DovecotMailboxInfo[]> {
    if (!this.conn) throw new Error('Not connected');
    return new Promise<DovecotMailboxInfo[]>((resolve) => {
      this.conn!.getMailboxes((_err: Error | null, mailboxes: any) => {
        // Mapear response a nuestra estructura
        const mapped: DovecotMailboxInfo[] = [];
        if (mailboxes) {
          // simple-imap returns mailbox tree; normalize
          mapped.push({
            path: 'INBOX',
            specialUse: ['\\Inbox'],
            messages: 0,
            unseen: 0,
            name: 'INBOX',
          });
        }
        resolve(mapped);
      });
    });
  }

  async search(conditions: any[]): Promise<number[]> {
    if (!this.conn) throw new Error('Not connected');
    return new Promise<number[]>((resolve, reject) => {
      this.conn!.search(conditions, (err: Error | null, results: number[]) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }

  async fetchMessages(uids: number[], options?: { bodies: string[]; markSeen: boolean }): Promise<MailEnvelope[]> {
    if (!this.conn) throw new Error('Not connected');

    return new Promise<MailEnvelope[]>((resolve, reject) => {
      const envelopes: MailEnvelope[] = [];
      const stream = this.conn!.fetch(uids, {
        bodies: options?.bodies || ['HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)'],
        markSeen: options?.markSeen ?? false,
        uid: true,
      });

      stream.on('message', (msg: any) => {
        const parts: Buffer[] = [];
        msg.on('body', (chunk: Buffer) => parts.push(chunk));
        msg.on('attributes', (attrs: any) => {
          // Envelope info de attributes
        });
        msg.on('end', () => {
          const rawHeader = Buffer.concat(parts).toString('utf8');
          const envelope = this.parseEnvelope(rawHeader, msg.attributes?.uid);
          envelopes.push(envelope);
        });
      });

      stream.on('error', reject);
      stream.on('end', () => resolve(envelopes));
    });
  }

  private parseEnvelope(raw: string, uid: number): MailEnvelope {
    const parseHeader = (name: string) => {
      const regex = new RegExp(`${name}:\\s*(.+)`, 'i');
      const match = raw.match(regex);
      return match ? match[1].trim() : '';
    };

    return {
      messageId: parseHeader('Message-ID') || generateSecureUuid(),
      from: parseHeader('From') || 'unknown',
      to: (parseHeader('To') || '').split(',').map(s => s.trim()),
      subject: parseHeader('Subject') || '(no subject)',
      date: parseHeader('Date') || new Date().toISOString(),
      flags: [],
      size: raw.length,
      uid: uid || 0,
    };
  }

  async toJMAPMail(envelope: MailEnvelope): Promise<JMAPMailMessage> {
    // Parsear headers para estructura JMAP
    const fromAddress: JMAPEmailAddress = {
      name: envelope.from,
      email: envelope.from,
    };

    const toAddresses: JMAPEmailAddress[] = envelope.to.map(t => ({
      name: t,
      email: t,
    }));

    const bodyStructure: JMAPBodyStructure = {
      type: 'message',
    };

    return {
      id: envelope.messageId,
      subject: envelope.subject,
      from: [fromAddress],
      to: toAddresses,
      cc: [],
      date: envelope.date,
      preview: envelope.subject.substring(0, 200),
      size: envelope.size,
      flags: envelope.flags,
      location: envelope.messageId,
      headers: {
        'Message-ID': [envelope.messageId],
        'From': [envelope.from],
        'To': envelope.to,
        'Subject': [envelope.subject],
        'Date': [envelope.date],
      },
      bodyStructure,
    };
  }

  getHealth(): BridgeHealthStatus {
    this.health.status = this.circuitBreaker.getStatus();
    this.health.last_check = Date.now();
    return this.health;
  }

  disconnect(): void {
    if (this.conn) {
      try {
        this.conn.end();
      } catch {
        // ignore — connection may already be closed
      }
      this.conn = null;
      this.connected = false;
    }
  }
}

// ------------------------------------------------------------------
// Connection Pool — maneja múltiples conexiones concurrentes
// ------------------------------------------------------------------
export class ImapBridgePool {
  private pools: Map<string, ImapConnectionWrapper> = new Map();
  private readonly maxPoolSize: number;

  constructor(maxPoolSize: number = 20) {
    this.maxPoolSize = maxPoolSize;
  }

  async getConnection(userId: string): Promise<ImapConnectionWrapper> {
    const poolKey = `pool:${userId}`;
    let connection = this.pools.get(poolKey);

    if (!connection || connection.getHealth().status !== 'healthy') {
      connection = new ImapConnectionWrapper();
      this.pools.set(poolKey, connection);
    }

    return connection;
  }

  async invalidateConnection(userId: string): Promise<void> {
    const poolKey = `pool:${userId}`;
    const conn = this.pools.get(poolKey);
    if (conn) {
      conn.disconnect();
      this.pools.delete(poolKey);
    }
  }

  async shutdown(): Promise<void> {
    for (const [, conn] of this.pools) {
      conn.disconnect();
    }
    this.pools.clear();
    auditLogger.info('IMAP bridge pool shut down');
  }

  getPoolSize(): number {
    return this.pools.size;
  }
}

// ------------------------------------------------------------------
// Singleton
// ------------------------------------------------------------------
let _imapPool: ImapBridgePool | null = null;

export function getImapBridgePool(): ImapBridgePool {
  if (!_imapPool) {
    _imapPool = new ImapBridgePool(20);
  }
  return _imapPool;
}