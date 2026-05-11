// ============================================================================
// Crux-Webmail — MIME Parser: Async Streaming Parser
// ============================================================================
// Desensambla buffers RFC822 crudos en estructuras normalizadas.
// Basado en `mailparser` con streaming para evitar OOM en payloads grandes.
// Soporta multipart/* (alternative, mixed, related, signed, encrypted).
// ============================================================================

import { Readable } from 'node:stream';
import MailParser from 'mailparser/lib/mail-parser.js';
import libmime from 'libmime';
import type { IAttachment as LibMimeAttachment } from 'libmime';

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
// MimeParser — singleton-style class
// ------------------------------------------------------------------
const MAX_ATTACHMENT = 10 * 1024 * 1024; // 10MB default
export const MAX_MESSAGE_SIZE = 25 * 1024 * 1024; // 25MB default

export interface MimePipelineConfig {
  maxMessageSize: number;
  maxAttachmentSize: number;
}

export const DEFAULT_MIME_CONFIG: MimePipelineConfig = {
  maxMessageSize: MAX_MESSAGE_SIZE,
  maxAttachmentSize: MAX_ATTACHMENT,
};

export class MimeParser {
  private config: MimePipelineConfig;

  constructor(config?: Partial<MimePipelineConfig>) {
    this.config = { ...DEFAULT_MIME_CONFIG, ...config };
  }

  updateConfig(partial: Partial<MimePipelineConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  async parse(rawBuffer: Buffer, uid?: string): Promise<ParsedMimeRaw> {
    if (!rawBuffer || rawBuffer.length === 0) {
      throw new Error('Empty message buffer');
    }

    const uidLabel = uid ?? 'unknown';

    // Size check
    if (rawBuffer.length > this.config.maxMessageSize) {
      throw new Error(
        `Message size ${rawBuffer.length} exceeds max allowed ${this.config.maxMessageSize}`
      );
    }

    const parser = new MailParser({
      streamAttachments: true, // we handle them manually
      // Use stable options; avoid deprecated flags.
    });

    const parsed: ParsedMimeRaw = await this.processMailParser(parser, rawBuffer, uidLabel);
    return parsed;
  }

  private processMailParser(
    parser: MailParser,
    buf: Buffer,
    uidLabel: string
  ): Promise<ParsedMimeRaw> {
    return new Promise((resolve, reject) => {
      const result: Partial<ParsedMimeRaw> = {};
      const attachments: MimeRawAttachment[] = [];

      parser.on('headers', (headers: Record<string, any>) => {
        // Keep reference to all headers for later
        result.headers = this.buildHeadersMap(headers);
        result.rawHeaders = JSON.stringify(headers);
      });

      parser.on('header', (name: string, value: unknown) => {
        if (!result.headers) {
          result.headers = { all: {}, raw: '' };
        }
        const normalized = this.normalizeHeaderName(name);

        // For specific fields we may reuse them later.
        const values = Array.isArray(value)
          ? value.map(String).filter(Boolean)
          : value != null && String(value).trim() !== ''
              ? [String(value)]
              : [];

        if (!result.headers.all[normalized]) {
          result.headers.all[normalized] = [];
        }
        for (const v of values) {
          result.headers.all[normalized].push(v);
        }

        // Direct mapping where useful:
        switch (normalized.toLowerCase()) {
          case 'message-id':
            if (!result.messageId && values.length > 0) {
              result.messageId = values[0]?.trim() || '';
            }
            break;
          case 'in-reply-to':
            if (!result.inReplyTo && values.length > 0) {
              const rfcRef = this.extractMrfRefs(values.join(' ').trim());
              result.inReplyTo = rfcRef[0] || values[0]?.trim() || undefined;
            }
            break;
          case 'references':
            if (!Array.isArray(result.references)) result.references = [];
            for (const val of values) {
              const refs = this.splitReferences(val.trim());
              for (const ref of refs) {
                result.references.push(ref);
              }
            }
            break;
        }

        // rawHeaders can accumulate as plain string later; leave JSON-safe fallback.
      });

      parser.on('data', async (obj: any) => {
        if (obj.type !== 'text' && obj.type !== 'html') return;

        const text = typeof obj.text === 'string' ? obj.text : '';

        if (obj.html) {
          result.html = result.html || '';
          result.html += text;
        } else {
          result.textPlain = result.textPlain || '';
          result.textPlain += text;
        }
      });

      parser.on('attachment', async (att: any) => {
        try {
          const attachment: Partial<MimeRawAttachment> = {};
          if (!att.filename || !String(att.filename).trim()) {
            attachment.filename = 'attachment';
          } else {
            // Decode filename with libmime helpers.
            const rawName = String(att.filename);
            try {
              attachment.filename = libmime.decodeWords(rawName);
            } catch {
              attachment.filename = rawName;
            }
          }

          attachment.contentType = att.headers && att.headers['content-type'] ? (att.headers['content-type'][0] || 'application/octet-stream') : 'application/octet-stream';

          // Ensure disposition default.
          const dispHeader: string | undefined = att.headers?.['content-disposition']?.[0];
          const dispParts: string[] = Array.isArray(dispHeader) ? [String(dispHeader)] : typeof dispHeader === 'string' ? [dispHeader] : [];
          const disposition = dispHeader ? String(dispHeader) : 'attachment';

          attachment.disposition = this.extractDispositionType(disposition);

          // Related detection: content-id suggests embedded.
          if (att.headers && att.headers['content-id']) {
            const cid: string | undefined = Array.isArray(att.headers['content-id']) ? String(att.headers['content-id'][0]) : typeof att.headers['content-id'] === 'string' ? att.headers['content-id'] : undefined;
            if (cid) {
              attachment.contentId = cid;
              attachment.related = true;
            }
          }

          const buffer: Buffer = await this.readStream(att.stream);

          // Check size.
          if (buffer.length > this.config.maxAttachmentSize) {
            // Truncate or store but mark for downstream handling.
            att.quarantined = true;
          } else {
            attachment.contentLength = buffer.length;
            attachment.content = buffer;
          }

          attachments.push(attachment as MimeRawAttachment);
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          att.quarantined = true;
          // Fallback safe entry.
          attachments.push({
            filename: 'quarantined-attachment',
            contentType: 'application/octet-stream',
            contentLength: 0,
            content: Buffer.alloc(0),
            disposition: 'attachment',
            related: false,
          });
        }
      });

      parser.on('error', (err) => {
        reject(err);
      });

      parser.on('end', async () => {
        // Now fill from structured fields.
        result.from = this.normalizeAddresses(parser.getHeadersFromAddressField('from'));
        result.to = this.normalizeAddresses(parser.getHeadersFromAddressField('to'));
        result.cc = this.normalizeAddresses(parser.getHeadersFromAddressField('cc'));
        const bccArr: any[] | undefined = parser.getHeadersFromAddressField?.('bcc') as any;
        result.bcc = this.normalizeAddresses(bccArr || []);

        // reply-to.
        try {
          const rtArr: any[] | undefined = (parser.getHeadersFromAddressField?.('reply-to') as any) ?? [];
          if (rtArr && Array.isArray(rtArr)) {
            result.replyTo = this.normalizeAddresses(rtArr);
          } else {
            result.replyTo = [];
          }
        } catch {
          result.replyTo = [];
        }

        // date.
        const d = parser.date;
        if (d instanceof Date) {
          result.date = d.toISOString();
        } else if ((d as any)?.toJSON?.()) {
          try {
            result.date = String((d as any).toJSON());
          } catch {
            result.date = new Date().toISOString();
          }
        } else {
          result.date = new Date().toISOString();
        }

        // body text/html.
        if (!result.text && typeof (parser as any).text === 'string') {
          result.text = (parser as any).text;
        }

        // Merge with what we built on data events:
        const finalTextPlain = result.textPlain || '';
        const finalHtml = result.html || '';

        // Combine text: prefer unified 'text' then plain.
        result.text = result.text || finalTextPlain;
        result.html = finalHtml;
        result.attachments = attachments;
        resolve(result as ParsedMimeRaw);
      });

      // Pipe message into parser.
      const stream = Readable.from(buf);
      stream.pipe(parser);
    });
  }

  private async readStream(stream: any): Promise<Buffer> {
    if (stream instanceof Buffer) return stream;
    if (!stream || typeof stream[Symbol.asyncIterator] === 'undefined' && typeof stream.on !== 'function') {
      return Buffer.alloc(0);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      const b = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
      chunks.push(b);
    }
    return Buffer.concat(chunks);
  }

  private buildHeadersMap(headers: Record<string, any>): MimeRawHeaders {
    const all: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!value) continue;
      const normalizedKey = this.normalizeHeaderName(key);
      const values: string[] = Array.isArray(value)
        ? value.map(String).filter(Boolean)
        : typeof value === 'string' && value.trim() !== ''
          ? [value]
          : [];

      if (values.length > 0) {
        all[normalizedKey] = all[normalizedKey] || [];
        all[normalizedKey].push(...values);
      }
    }
    return { all, raw: '' };
  }

  private normalizeHeaderName(name: string): string {
    if (!name) return '';
    return name
      .trim()
      .toLowerCase()
      .replace(/([a-z])([A-Z])/g, '$1-$2')   // camelCase -> kebab-case
      .replace(/^[_-]/, '')
      .replace(/[_]+/g, '-')
      .trim();
  }

  private extractDispositionType(value: string): 'inline' | 'attachment' {
    if (!value) return 'attachment';
    const v = value.toLowerCase().split(';')[0].trim();
    if (v === 'inline') return 'inline';
    if (v.includes('attach')) return 'attachment';
    return 'attachment';
  }

  private extractMrfRefs(v: string): string[] {
    const out: string[] = [];
    const matches = String(v).match(/<[^<>]+>/g);
    for (const m of matches || []) {
      const inner = m.replace(/[<>]/g, '').trim();
      if (inner) out.push(inner);
    }
    return out;
  }

  private splitReferences(v: string): string[] {
    if (!v || !String(v).trim()) return [];
    return String(v)
      .split(/[,;\s]+/)
      .map((ref) => ref.trim().replace(/[<>]/g, ''))
      .filter(Boolean);
  }

  private normalizeAddresses(
    arr: Array<any> | undefined
  ): MimeAddressEntry[] {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return [];
    const out: MimeAddressEntry[] = [];

    for (const a of arr) {
      try {
        const name = typeof a?.name === 'string' ? a.name : '';
        let address = (a?.address ?? String(a)) as string;

        // Remove angle brackets wrapper if present.
        if (address.startsWith('<') && address.endsWith('>')) {
          address = address.slice(1, -1);
        }

        out.push({
          name: (name || '').trim(),
          address: (address || '').trim(),
        });
      } catch {
        // skip broken entry.
      }
    }
    return out;
  }
}