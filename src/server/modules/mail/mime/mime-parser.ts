// ============================================================================
// Crux-Webmail — MIME Parser: Async Streaming Parser
// ============================================================================
// Desensambla buffers RFC822 crudos en estructuras normalizadas.
// Basado en `mailparser` con streaming para evitar OOM en payloads grandes.
// Soporta multipart/* (alternative, mixed, related, signed, encrypted).
// ============================================================================

import { Readable } from 'node:stream';
import { simpleParser, ParserDelegate } from 'mailparser';
import type { ParsedMail } from 'mailparser';
import { auditLogger } from '../../utils/audit-logger';
import { DEFAULT_MIME_CONFIG, MimePipelineConfig } from './types';

export interface ParsedMimeRaw {
  messageId: string;
  subject: string;
  from: MimeAddressEntry[];
  to: MimeAddressEntry[];
  cc: MimeAddressEntry[];
  bcc: MimeAddressEntry[];
  replyTo?: MimeAddressEntry[];
  date: string;
  inReplyTo?: string;
  references: string[];
  text: string;
  html: string;
  textPlain: string;
  attachments: MimeRawAttachment[];
  headers: MimeRawHeaders;
  rawHeaders: string;
}

export interface MimeAddressEntry {
  name: string;
  address: string;
}

export interface MimeRawAttachment {
  filename: string;
  contentType: string;
  contentLength: number;
  content: Buffer;
  contentId?: string;
  disposition: string;
  related?: boolean;
}

export interface MimeRawHeaders {
  all: Record<string, string[]>;
  raw: string;
}

// ------------------------------------------------------------------
// MimeParser — singleton service
// ------------------------------------------------------------------
export class MimeParser {
  private config: MimePipelineConfig;

  constructor(config?: Partial<MimePipelineConfig>) {
    this.config = { ...DEFAULT_MIME_CONFIG, ...config };
  }

  updateConfig(partial: Partial<MimePipelineConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  // ----------------------------------------------------------------
  // Main parse method — async streaming
  // ----------------------------------------------------------------
  async parse(rawBuffer: Buffer, uid?: string): Promise<ParsedMimeRaw> {
    const uidLabel = uid ?? 'unknown';
    const startTime = Date.now();

    // 1. Validate size
    if (rawBuffer.length > this.config.maxMessageSize) {
      const msg = `Message exceeds max size: ${rawBuffer.length} > ${this.config.maxMessageSize}`;
      auditLogger.warn(`MIME parse size exceeded for ${uidLabel}`, {
        metadata: {
          actualSize: rawBuffer.length,
          maxSize: this.config.maxMessageSize,
        },
      });
      throw new Error(msg);
    }

    try {
      // 2. Parse via mailparser with delegate for streaming
      const parsed = await this.parseWithDelegate(rawBuffer, uidLabel);

      const duration = Date.now() - startTime;
      auditLogger.info(`MIME parsed successfully for ${uidLabel}`, {
        metadata: {
          durationMs: duration,
          size: rawBuffer.length,
          attachments: parsed.attachments.length,
        },
      });

      return parsed;
    } catch (err) {
      auditLogger.error(`MIME parse failed for ${uidLabel}`, {
        metadata: {
          error: (err as Error).message,
          durationMs: Date.now() - startTime,
        },
      });
      throw err;
    }
  }

  // ----------------------------------------------------------------
  // Parse with delegate for fine-grained control
  // ----------------------------------------------------------------
  private async parseWithDelegate(raw: Buffer, uid: string): Promise<ParsedMimeRaw> {
    const delegate = this.buildDelegate(uid);

    // Use simpleParser which handles encoding, decoding, multipart nesting
    const parsed = await simpleParser(Readable.from(raw), {
      streams: true,
      delegate,
    });

    return {
      messageId: parsed.messageId || '',
      subject: parsed.subject || '(No Subject)',
      from: this.normalizeAddresses(parsed.from),
      to: this.normalizeAddresses(parsed.to),
      cc: this.normalizeAddresses(parsed.cc),
      bcc: this.normalizeAddresses(parsed.bcc),
      replyTo: this.normalizeAddresses(parsed.replyTo),
      date: parsed.date?.toISOString() || parsed.dateString || new Date().toISOString(),
      inReplyTo: parsed.inReplyTo,
      references: parsed.references || [],
      text: parsed.text || '',
      html: parsed.html || '',
      textPlain: parsed.textPlain || '',
      attachments: parsed.attachments || [],
      headers: {
        all: parsed.headers || {},
        raw: parsed.headersRaw || '',
      },
      rawHeaders: parsed.headersRaw || '',
    };
  }

  // ----------------------------------------------------------------
  // Build delegate callback for streaming attachment processing
  // ----------------------------------------------------------------
  private buildDelegate(uid: string): ParserDelegate {
    return {
      attachment: async (attachment, _index, _total) => {
        try {
          const buf = await this.readStreamBuffer(attachment.content);
          // Store as Buffer in place of the stream
          attachment.content = buf;
          attachment.contentLength = buf.length;

          // Check individual attachment size
          if (attachment.contentLength > this.config.maxAttachmentSize) {
            auditLogger.warn(`Attachment ${attachment.filename} exceeds size limit`, {
              metadata: {
                uid,
                filename: attachment.filename,
                size: attachment.contentLength,
              },
            });
            attachment.quarantined = true;
          }
        } catch (err) {
          auditLogger.error(`Failed to read attachment content`, {
            metadata: {
              uid,
              filename: attachment.filename,
              error: (err as Error).message,
            },
          });
          attachment.content = Buffer.from('');
          attachment.quarantined = true;
        }
      },
    };
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------
  private async readStreamBuffer(stream: Readable | Buffer | undefined): Promise<Buffer> {
    if (stream instanceof Buffer) return stream;
    if (!stream) return Buffer.from('');

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private normalizeAddresses(addr: any): MimeAddressEntry[] {
    if (!addr) return [];
    if (Array.isArray(addr)) return addr.map(this.normalizeSingleAddress);
    return [this.normalizeSingleAddress(addr)];
  }

  private normalizeSingleAddress(addr: any): MimeAddressEntry {
    if (!addr) return { name: '', address: '' };
    if (typeof addr === 'string') return { name: '', address: addr };
    return {
      name: addr.name || '',
      address: addr.address || '',
    };
  }
}