// Audit logger for session/authentication events
export class AuditLogger {
  info(msg: string, ctx?: Record<string, any>): void { /* no-op in dev */ }
  warn(msg: string, ctx?: Record<string, any>): void {}
  error(msg: string, ctx?: Record<string, any>): void {}
  critical(msg: string, ctx?: Record<string, any>): void {}
}

export const auditLogger = new AuditLogger();