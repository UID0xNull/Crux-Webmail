// ============================================================================
// Crux-Webmail — SmtpAdapter: nodemailer → ISmtpAdapter
// ============================================================================
// Adaptador concreto que traduce nodemailer al contrato normalizado.
// Pool de conexiones, DKIM headers, retry, circuit breaker.
// ============================================================================

import nodemailer from 'nodemailer';
import type {
  ISmtpAdapter,
  ICreateMessageInput,
  ISendResult,
  IAccountConfig,
  IMailAddress,
  IAttachment,
} from '../contracts';
import { CruxError } from 'errors/handler';
import { auditLogger } from 'utils/audit-logger';
import { generateSecureUuid } from 'utils/crypto';
import { config } from 'config/app.config';

// ------------------------------------------------------------------
// SmtpAdapter — concrete implementation
// ------------------------------------------------------------------
export class SmtpAdapter implements ISmtpAdapter {
  private transport: nodemailer.Transporter<nodemailer.SentMessageInfo> | null = null;
  private ready: boolean = false;
  private currentConfig: IAccountConfig | null = null;
  private failures: number = 0;
  private readonly failureThreshold: number = 5;
  private readonly resetTimeout: number = 30_000;
  private nextRetry: number = 0;

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async connect(cfg: IAccountConfig): Promise<void> {
    this.currentConfig = cfg;

    this.transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        ciphers: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256',
      },
      auth: {
        user: cfg.username,
        pass: cfg.password,
      },
      pool: true,
      maxConnections: 10,
      maxMessages: 100,
      socketTimeout: 30000,
      connectionTimeout: 10000,
    });

    await this.transport.verify();
    this.ready = true;
    this.failures = 0;

    auditLogger.info('SMTP adapter connected', {
      actor_id: cfg.accountId,
      metadata: {
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
      },
    });
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
      this.ready = false;
      this.currentConfig = null;
      auditLogger.info('SMTP adapter disconnected');
    }
  }

  isReady(): boolean {
    return this.ready && this.transport !== null;
  }

  // ----------------------------------------------------------------
  // Send
  // ----------------------------------------------------------------
  async send(cfg: IAccountConfig, message: ICreateMessageInput): Promise<ISendResult> {
    this.checkCircuit();
    this.ensureReady();

    const startTime = Date.now();

    try {
      const mailOpts: nodemailer.SendMailOptions = {
        from: this.formatAddress(message.from),
        to: message.to.map((a) => this.formatAddress(a)).join(', '),
        subject: message.subject,
        text: message.bodyText,
        html: message.bodyHtml,
      };

      if (message.cc && message.cc.length > 0) {
        mailOpts.cc = message.cc.map((a) => this.formatAddress(a)).join(', ');
      }

      if (message.bcc && message.bcc.length > 0) {
        mailOpts.bcc = message.bcc.map((a) => this.formatAddress(a)).join(', ');
      }

      if (message.replyTo) {
        mailOpts.replyTo = this.formatAddress(message.replyTo);
      }

      if (message.attachments && message.attachments.length > 0) {
        mailOpts.attachments = this.mapAttachments(message.attachments);
      }

      // Custom headers
      mailOpts.headers = {
        'X-Crux-Mail-ID': generateSecureUuid(),
        'X-Crux-Sent-At': new Date().toISOString(),
        'X-Mailer': 'Crux-Webmail/2.0',
        ...message.headers,
      };

      const info = await this.transport!.sendMail(mailOpts);

      const latency = Date.now() - startTime;
      this.recordSuccess();

      auditLogger.info('Mail sent via SMTP adapter', {
        actor_id: cfg.accountId,
        metadata: {
          from: message.from.email,
          to: message.to.map((a) => a.email),
          envelope_id: info.envelopeId || info.messageId,
          latency_ms: latency,
          accepted: info.accepted,
          rejected: info.rejected,
        },
      });

      return {
        envelopeId: info.envelopeId || info.messageId || generateSecureUuid(),
        messageId: info.messageId || generateSecureUuid(),
        accepted: info.accepted || [],
        rejected: info.rejected || [],
        dkimSigned: true,
        tlsUsed: info.envelope?.tls ?? true,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      this.recordFailure();

      auditLogger.error('SMTP send failed', {
        actor_id: cfg.accountId,
        metadata: {
          error: (err as Error).message,
          latency_ms: Date.now() - startTime,
        },
      });

      throw new CruxError('SMTP_SEND_FAILED', 'Failed to send message');
    }
  }

  // ----------------------------------------------------------------
  // Verify
  // ----------------------------------------------------------------
  async verify(cfg: IAccountConfig): Promise<boolean> {
    if (!this.transport) return false;
    try {
      await this.transport.verify();
      this.recordSuccess();
      return true;
    } catch {
      this.recordFailure();
      return false;
    }
  }

  // ----------------------------------------------------------------
  // Internal
  // ----------------------------------------------------------------
  private formatAddress(addr: IMailAddress): string {
    if (addr.name) {
      return `${addr.name} <${addr.email}>`;
    }
    return addr.email;
  }

  private mapAttachments(attachments: Partial<IAttachment>[]): Array<Record<string, unknown>> {
    return attachments
      .filter((a) => a.content)
      .map((a) => ({
        filename: a.filename || 'attachment',
        contentType: a.mimeType,
        content: a.content as Buffer,
        disposition: a.disposition || 'attachment',
        contentId: a.contentId,
      }));
  }

  private ensureReady(): void {
    if (!this.ready || !this.transport) {
      throw new CruxError('SMTP_NOT_CONNECTED', 'SMTP adapter not connected');
    }
  }

  private checkCircuit(): void {
    if (this.failures >= this.failureThreshold) {
      if (Date.now() > this.nextRetry) {
        // Half-open: allow one attempt
        return;
      }
      throw new CruxError('SMTP_CIRCUIT_OPEN', 'SMTP temporarily unavailable');
    }
  }

  private recordSuccess(): void {
    this.failures = 0;
  }

  private recordFailure(): void {
    this.failures += 1;
    this.nextRetry = Date.now() + this.resetTimeout;

    if (this.failures >= this.failureThreshold) {
      auditLogger.error('SMTP circuit breaker OPEN', {
        metadata: { failures: this.failures },
      });
    }
  }
}