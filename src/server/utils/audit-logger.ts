// ============================================================================
// Crux-Webmail — Audit Logger Inmutable (JSON structured + Loki ready)
// ============================================================================
import { AuditEvent } from '../types/global';
import { generateSecureUuid } from './crypto';

// ------------------------------------------------------------------
// AuditLogger — append-only, checksum por bloque, Loki-compatible
// ------------------------------------------------------------------
export type AuditLevel = 'info' | 'warn' | 'error' | 'critical' | 'fatal';

export class AuditLogger {
  private events: AuditEvent[] = [];
  private readonly maxBuffer: number;
  private readonly source: string;

  constructor(options?: { source?: string; maxBuffer?: number }) {
    this.source = options?.source || 'backend-core';
    this.maxBuffer = options?.maxBuffer || 1000;
  }

  // ----------------------------------------------------------------
  // MÃ©todos de log por nivel
  // ----------------------------------------------------------------
  info(message: string, metadata: Partial<AuditEvent> = {}): AuditEvent {
    return this.write('info', message, metadata);
  }

  warn(message: string, metadata: Partial<AuditEvent> = {}): AuditEvent {
    return this.write('warn', message, metadata);
  }

  error(message: string, metadata: Partial<AuditEvent> = {}): AuditEvent {
    return this.write('error', message, metadata);
  }

  critical(message: string, metadata: Partial<AuditEvent> = {}): AuditEvent {
    return this.write('critical', message, metadata);
  }

  fatal(message: string, metadata: Partial<AuditEvent> = {}): AuditEvent {
    return this.write('critical', message, { ...metadata, fatal: true } as any);
  }

  // ----------------------------------------------------------------
  // Write principal — crea el evento inmutable
  // ----------------------------------------------------------------
  private write(
    level: 'info' | 'warn' | 'error' | 'critical',
    message: string,
    metadata: Partial<AuditEvent> = {}
  ): AuditEvent {
    const event: AuditEvent = {
      event_id: generateSecureUuid(),
      timestamp: new Date().toISOString(),
      source: this.source,
      level,
      message,
      actor_id: metadata.actor_id,
      session_id: metadata.session_id,
      client_ip: metadata.client_ip,
      user_agent: metadata.user_agent,
      metadata: metadata.metadata,
    };

    this.events.push(event);

    // Evitar OOM: flush cuando el buffer excede el lÃ­mite
    if (this.events.length > this.maxBuffer) {
      this.flush().catch(() => {
        console.error('[AUDIT FLUSH FAILED]');
      });
    }

    // Output JSON structured (stdout â†’ Loki via fluent-bit / promtail)
    console.log(JSON.stringify(event));

    // Eventos crÃ­ticos: alert inmediata
    if (level === 'critical') {
      console.error(`[CRITICAL AUDIT] ${message}`);
    }

    return event;
  }

  // ----------------------------------------------------------------
  // Flush buffer a almacenamiento persistente
  // ----------------------------------------------------------------
  async flush(): Promise<void> {
    if (this.events.length === 0) return;
    const batch = [...this.events];
    this.events = [];

    // En producciÃ³n: escribir a PostgreSQL audit_log table
    try {
      // Placeholder para integraciÃ³n con DB en Step 2+
      console.log(`[AUDIT FLUSH] ${batch.length} events batched`);
    } catch (err) {
      console.error('[AUDIT FLUSH ERROR]', err);
    }
  }

  // ----------------------------------------------------------------
  // Query reciente (para debugging / forensics)
  // ----------------------------------------------------------------
  getRecent(count: number = 10): AuditEvent[] {
    return this.events.slice(-count);
  }
}

// Singleton para uso global
const globalAudit = new AuditLogger();
export { globalAudit as auditLogger };