// ============================================================================
// Crux-Webmail — MIME Pipeline: Main Async Processor
// ============================================================================
// Orquesta el flujo completo: parse → sanitize → validate → scan.
// Emite eventos de progreso vía EventEmitter para UI en tiempo real.
// Integra con BullMQ para escaneo asíncrono de adjuntos.
// ============================================================================

import { EventEmitter } from 'node:events';
import { auditLogger } from '@utils/audit-logger';
import { MimeParser, MimeRawAttachment, ParsedMimeRaw } from './mime-parser';
import { HtmlSanitizer, SanitizationReport } from './html-sanitizer';
import { AttachmentValidator } from './attachment-validator';
import { ClamavScanner } from './clamav-scanner';
import {
  ParsedEmail,
  ParsedAttachment,
  MimeHeaders,
  MimeAddress,
  MimePipelineConfig,
  DEFAULT_MIME_CONFIG,
  AttachmentSecurityStatus,
  VirusScanStatus,
} from './types';

// ------------------------------------------------------------------
// Pipeline event names
// ------------------------------------------------------------------
const EVT_PARSE = 'mime:parse';
const EVT_SANITIZE = 'mime:sanitize';
const EVT_VALIDATE = 'mime:validate';
const EVT_SCAN = 'mime:scan';
const EVT_SCAN_COMPLETE = 'mime:scan_complete';
const EVT_COMPLETE = 'mime:complete';
const EVT_ERROR = 'mime:error';

// ------------------------------------------------------------------
// MimePipeline — main orchestrator
// ------------------------------------------------------------------
export class MimePipeline extends EventEmitter {
  private parser: MimeParser;
  private sanitizer: HtmlSanitizer;
  private validator: AttachmentValidator;
  private clamavScanner: ClamavScanner | null;
  private config: MimePipelineConfig;

  constructor(config?: Partial<MimePipelineConfig>) {
    super();
    this.config = { ...DEFAULT_MIME_CONFIG, ...config };

    this.parser = new MimeParser(this.config);
    this.sanitizer = new HtmlSanitizer(this.config);

    // Initialize ClamAV scanner if enabled
    if (this.config.clamavEnabled) {
      this.clamavScanner = new ClamavScanner({
        enabled: true,
        host: this.config.clamavHost,
        port: this.config.clamavPort,
        timeout: this.config.clamavTimeout,
      });
    } else {
      this.clamavScanner = null;
    }

    this.validator = new AttachmentValidator(this.config, this.clamavScanner || undefined);

    auditLogger.info('MimePipeline initialized', {
      metadata: {
        maxMessageSize: this.config.maxMessageSize,
        maxAttachmentSize: this.config.maxAttachmentSize,
        sanitizeHtml: this.config.sanitizeHtml,
        clamavEnabled: this.config.clamavEnabled,
      },
    });
  }

  updateConfig(partial: Partial<MimePipelineConfig>): void {
    this.config = { ...this.config, ...partial };
    this.parser.updateConfig(this.config);
    this.sanitizer.updateConfig(this.config);
    this.validator.updateConfig(this.config);
  }

  // ----------------------------------------------------------------
  // Main process: take raw MIME buffer, return fully parsed ParsedEmail
  // ----------------------------------------------------------------
  async process(rawBuffer: Buffer, uid: string): Promise<ParsedEmail> {
    const pipelineStart = Date.now();

    try {
      this.emit(EVT_PARSE, { uid });

      // Step 1: Parse MIME structure
      const parsed = await this.parser.parse(rawBuffer, uid);

      this.emit(EVT_SANITIZE, { uid });

      // Step 2: Sanitize HTML body
      const sanitizedHtml = this.sanitizeHtmlBody(parsed.html, uid);

      this.emit(EVT_VALIDATE, { uid, attachmentCount: parsed.attachments.length });

      // Step 3: Validate attachments
      const validatedAttachments = await this.validateAttachments(
        parsed.attachments,
        uid,
      );

      // Step 4: Calculate security metadata
      const security = this.calculateSecurity(
        validatedAttachments,
        sanitizedHtml.report,
        uid,
      );

      const parsedEmail: ParsedEmail = {
        uid,
        messageId: parsed.messageId,
        subject: parsed.subject ?? '',
        headers: this.buildHeaders(parsed),
        bodyText: parsed.text,
        bodyHtml: sanitizedHtml.cleanHtml,
        bodyPreview: this.extractPreview(parsed.text, sanitizedHtml.cleanHtml),
        attachments: validatedAttachments,
        security,
        parsedAt: new Date().toISOString(),
        processingDurationMs: Date.now() - pipelineStart,
      };

      this.emit(EVT_COMPLETE, { uid, parsed: parsedEmail });

      return parsedEmail;
    } catch (err) {
      this.emit(EVT_ERROR, { uid, error: err as Error });

      auditLogger.error(`MIME pipeline failed for ${uid}`,
        {
          metadata: {
            error: (err as Error).message,
            durationMs: Date.now() - pipelineStart,
          },
        },
      );

      throw err;
    }
  }

  // ----------------------------------------------------------------
  // Process multiple emails (batch mode)
  // ----------------------------------------------------------------
  async processBatch(
    messages: Array<{ buffer: Buffer; uid: string }>,
  ): Promise<ParsedEmail[]> {
    const results: ParsedEmail[] = [];

    for (const msg of messages) {
      try {
        const parsed = await this.process(msg.buffer, msg.uid);
        results.push(parsed);
      } catch (err) {
        auditLogger.error(`MIME pipeline batch error for ${msg.uid}`,
          {
            metadata: { error: (err as Error).message },
          },
        );
        // Skip problematic messages
      }
    }

    return results;
  }

  // ----------------------------------------------------------------
  // Async virus scanning — returns immediately, scans in background
  // Emits scan events as each attachment is processed
  // ----------------------------------------------------------------
  async scanAttachmentsAsync(
    attachments: ParsedAttachment[],
    uid: string,
  ): Promise<void> {
    if (!this.clamavScanner) return;

    for (const attachment of attachments) {
      // Skip already scanned/quarantined
      if (
        attachment.virusScanStatus === 'clean' ||
        attachment.virusScanStatus === 'skipped' ||
        attachment.securityStatus === 'quarantined'
      ) {
        continue;
      }

      this.emit(EVT_SCAN, {
        uid,
        attachmentId: attachment.contentId || attachment.filename,
      });

      try {
        const status = await this.validator.scanWithClamAV(attachment, uid);

        this.emit(EVT_SCAN_COMPLETE, {
          uid,
          attachmentId: attachment.contentId || attachment.filename,
          status,
        });
      } catch (err) {
        auditLogger.error(`Async virus scan failed for attachment in ${uid}`,
          {
            metadata: {
              filename: attachment.filename,
              error: (err as Error).message,
            },
          },
        );
      }
    }
  }

  // ----------------------------------------------------------------
  // Internal: sanitize HTML
  // ----------------------------------------------------------------
  private sanitizeHtmlBody(
    html: string,
    uid: string
  ): { cleanHtml: string; report: SanitizationReport } {
    return this.sanitizer.sanitize(html || '', uid);
  }

  // ----------------------------------------------------------------
  // Internal: validate attachments and enrich with metadata
  // ----------------------------------------------------------------
  private async validateAttachments(
    attachments: MimeRawAttachment[],
    uid: string,
  ): Promise<ParsedAttachment[]> {
    const validated: ParsedAttachment[] = [];

    // Process in parallel with concurrency limit to avoid OOM
    const CONCURRENT_LIMIT = 4;
    for (let i = 0; i < attachments.length; i += CONCURRENT_LIMIT) {
      const batch = attachments.slice(i, i + CONCURRENT_LIMIT);

      const batchResults = await Promise.all(
        batch.map(async (att) => {
          const parsedAttachment: ParsedAttachment = {
            filename: att.filename || 'unnamed',
            mimeType: att.contentType || 'application/octet-stream',
            size: att.contentLength || att.content?.length || 0,
            content: att.content || Buffer.from(''),
            contentId: att.contentId,
            disposition: att.disposition === 'inline' ? 'inline' : 'attachment',
            securityStatus: 'validating' as AttachmentSecurityStatus,
            virusScanStatus: 'pending' as VirusScanStatus,
            validatedAt: new Date().toISOString(),
          };

          const result = await this.validator.validateAttachment(
            parsedAttachment,
            uid,
          );

          if (!result.approved) {
            parsedAttachment.securityStatus = 'quarantined';
            // Keep the attachment but flag it
            auditLogger.info(`Attachment quarantined for ${uid}`,
              {
                metadata: {
                  filename: att.filename,
                  reason: result.reason,
                },
              },
            );
          }

          return parsedAttachment;
        }),
      );

      validated.push(...batchResults);
    }

    // Enforce attachment count limit
    if (validated.length > this.config.maxAttachments) {
      auditLogger.warn(`Attachment count exceeded for ${uid}, limiting to ${this.config.maxAttachments}`);
    }

    return validated.slice(0, this.config.maxAttachments);
  }

  // ----------------------------------------------------------------
  // Internal: build normalized headers
  // ----------------------------------------------------------------
  private buildHeaders(parsed: ParsedMimeRaw): MimeHeaders {
    const normalizeAddr = (addr: MimeAddress[] | undefined) => {
      if (!Array.isArray(addr) || addr.length === 0) return [];
      return addr.map((a) => ({
        name: a?.name ?? '',
        address: a?.address ?? '',
      }));
    };

    return {
      from: normalizeAddr(parsed.from),
      to: normalizeAddr(parsed.to),
      cc: normalizeAddr(parsed.cc),
      bcc: normalizeAddr(parsed.bcc),      subject: parsed.subject || '(No Subject)',
      date: parsed.date || new Date().toISOString(),
      messageId: parsed.messageId || '',
      inReplyTo: parsed.inReplyTo,
      references: Array.isArray(parsed.references) ? parsed.references : [],
      replyTo: parsed.replyTo && Array.isArray(parsed.replyTo)
        ? normalizeAddr(parsed.replyTo)
        : [],
      headers: parsed.headers?.all || {},
      rawHeaders: (parsed.rawHeaders || parsed.headers?.raw) ?? '',
    };
  }

  // ----------------------------------------------------------------
  // Internal: calculate security metadata
  // ----------------------------------------------------------------
  private calculateSecurity(
    attachments: ParsedAttachment[],
    sanitizationReport: SanitizationReport,
    _uid: string,
  ): ParsedEmail['security'] {    const quarantined = attachments.filter(
      (a) => a.securityStatus === 'quarantined',
    ).length;

    const infected = attachments.filter(
      (a) => a.virusScanStatus === 'infected',
    ).length;

    const xssThreats = sanitizationReport?.threatsFound || 0;

    // Determine overall risk level as typed union, not as ParsedEmail['security'].
    let overallRisk: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (infected > 0) {
      overallRisk = 'critical';
    } else if (quarantined > 2) {
      overallRisk = 'high';
    } else if (xssThreats > 5 || quarantined > 0) {
      overallRisk = 'medium';
    }

    // Check if ClamAV scan is complete (all scanned or skipped)
    const clamavComplete = this.clamavScanner
      ? attachments.every(
          (a) =>
            a.virusScanStatus === 'clean' ||
            a.virusScanStatus === 'skipped' ||
            a.virusScanStatus === 'infected',
        )
      : true;

    return {
      xssThreatsFound: xssThreats,
      sanitizedElements:
        (Array.isArray(sanitizationReport?.removedElements)
          ? sanitizationReport.removedElements
          : []),
      clamavScanComplete: clamavComplete,
      attachmentsQuarantined: quarantined,
      overallRisk,
    };
  }

  // ----------------------------------------------------------------
  // Internal: extract plain-text preview
  // ----------------------------------------------------------------
  private extractPreview(text: string, html: string): string {
    if (text) {
      // Strip excess whitespace, truncate
      const cleaned = text.replace(/\s+/g, ' ').trim();
      return cleaned.substring(0, 500);
    }

    if (html) {
      // Minimal HTML-to-text: strip tags
      const textContent = html.replace(/<[^>]*>/g, ' ');
      const cleaned = textContent.replace(/\s+/g, ' ').trim();
      return cleaned.substring(0, 500);
    }

    return '(No preview available)';
  }

  // ----------------------------------------------------------------
  // Getter for internal services (for dependency injection)
  // ----------------------------------------------------------------
  getParser(): MimeParser {
    return this.parser;
  }

  getSanitizer(): HtmlSanitizer {
    return this.sanitizer;
  }

  getValidator(): AttachmentValidator {
    return this.validator;
  }

  getClamavScanner(): ClamavScanner | null {
    return this.clamavScanner;
  }

  getConfig(): MimePipelineConfig {
    return this.config;
  }

  // ----------------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------------
  destroy(): void {
    this.removeAllListeners();
    if (this.clamavScanner) {
      this.clamavScanner.removeAllListeners();
    }
  }
}