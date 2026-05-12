// ============================================================================
// Crux-Webmail — MIME Parser: Async Streaming Parser
// ============================================================================
// Desensambla buffers RFC822 crudos en estructuras normalizadas.
// Basado en `mailparser` con streaming para evitar OOM en payloads grandes.
// Soporta multipart/* (alternative, mixed, related, signed, encrypted).
// ============================================================================

import MailParser from 'mailparser';
import { Readable } from 'node:stream';

import type { MimePipelineConfig } from './types';

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
  disposition: 'inline' | 'attachment';
  related?: boolean;
}

export interface MimeRawHeaders {
  all: Record<string, string[]>;
  raw: string;
}

// ------------------------------------------------------------------
// MimeParser — singleton-style class (uses shared MimePipelineConfig)
// ------------------------------------------------------------------
const MAX_ATTACHMENT = 10 * 1024 * 1024; // 10MB default
export const MAX_MESSAGE_SIZE = 25 * 1024 * 1024; // 25MB default

// Local view aligned to the shared MimePipelineConfig (from ./types).
type MimeParserLocalCfg = Pick<MimePipelineConfig, 'maxMessageSize' | 'maxAttachmentSize'>;

export const DEFAULT_MIME_PARSER_CONFIG: MimeParserLocalCfg = {
  maxMessageSize: MAX_MESSAGE_SIZE,
  maxAttachmentSize: MAX_ATTACHMENT,
};

type MailParserDataEvent = { type?: string | 'html' | 'text'; html?: boolean; text?: string };
type MailParserAttachEvent = Readable & {
  filename?: string;
  stream: Readable | Buffer | AsyncIterable<Buffer>;
  headers?: Record<string, (string | number)[]> | Record<string, unknown>;
};

export class MimeParser {
  private config: MimeParserLocalCfg;

  constructor(config?: Partial<MimeParserLocalCfg>) {
    this.config = { ...DEFAULT_MIME_PARSER_CONFIG, ...config };
  }

  updateConfig(partial: Partial<MimeParserLocalCfg>): void {
    this.config = { ...this.config, ...partial };
  }

  async parse(rawBuffer: Buffer, _uid?: string): Promise<ParsedMimeRaw> {
    if (!rawBuffer || rawBuffer.length === 0) {
      throw new Error('Empty message buffer');
    }

    // Size check.
    if (rawBuffer.length > this.config.maxMessageSize) {
      throw new Error(
        `Message size ${rawBuffer.length} exceeds max allowed ${this.config.maxMessageSize}`
      );
    }

    const parser = new MailParser({
      streamAttachments: true, // we handle them manually.
      // Use stable options; avoid deprecated flags.
    });

    return this.processMailParser(parser, rawBuffer);
  }

  private processMailParser(
    parser: MailParser,
    buf: Buffer
  ): Promise<ParsedMimeRaw> {
    return new Promise((resolve, reject) => {
      const result: Partial<ParsedMimeRaw> = {};
      const attachments: MimeRawAttachment[] = [];

      parser.on('headers', (headers: Record<string, unknown>) => {
        result.headers = this.buildHeadersMap(headers);
        try {
          result.rawHeaders = JSON.stringify(headers);
        } catch {
          // Fallback for weird non-serializable headers.
          result.rawHeaders = '';
        }
      });

      parser.on('header', (name: string, value: unknown) => {
        if (!result.headers) {
          result.headers = { all: {}, raw: '' };
        }
        const normalized = this.normalizeHeaderName(name);

        // Normalize to array of strings.
        const values = Array.isArray(value)
          ? (value as []).map(String).filter(Boolean)
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
        const key = normalized.toLowerCase();
        if (key === 'message-id') {
          if (!result.messageId && values.length > 0) {
            result.messageId = String(values[0]).trim() || '';
          }
        } else if (key === 'in-reply-to') {
          if (!result.inReplyTo && values.length > 0) {
            const refs = this.extractBracketedRefs(String(value));
            result.inReplyTo = refs[0] ?? String(values[0]).trim() ?? undefined;
          }
        } else if (key === 'references') {
          if (!Array.isArray(result.references)) result.references = [];
          for (const val of values) {
            const refs = this.splitReferences(val);
            for (const ref of refs) {
              result.references.push(ref);
            }
          }
        }
      });

      parser.on('data', async (obj: MailParserDataEvent | Record<string, unknown>) => {
        if (!obj || typeof obj !== 'object') return;
        const typed = obj as MailParserDataEvent;

        // Skip non-text content.
        const t = typed.type ?? String((typed as any).text);
        if ((t as string | undefined) !== 'text' && (t as boolean | string) !== true) {
          if (!typed.html) return;
        }

        const text = typeof typed.text === 'string' ? typed.text : '';
        if (!text) return;

        // If html is set or type is html → HTML part.
        if (typed.html || t === 'html') {
          result.html = (result.html ?? '') + text;
        } else {
          result.textPlain = (result.textPlain ?? '') + text;
        }
      });

      parser.on('attachment', async (att: MailParserAttachEvent | Record<string, unknown>) => {
        try {
          const attachment: Partial<MimeRawAttachment> = {};

          // filename.
          let rawName = '';
          if (att.filename && String(att.filename).trim()) {
            rawName = String(att.filename);
          } else {
            rawName = 'attachment';
          }

          try {
            attachment.filename = this.decodeWord(rawName);
          } catch {
            attachment.filename = rawName;
          }

          // content-type.
          const headers = att.headers as Record<string, (string | number)[]> | undefined ?? {};
          const ctVals = headers['content-type'];
          if (ctVals && ctVals[0]) {
            attachment.contentType = String(ctVals[0]).trim() || 'application/octet-stream';
          } else {
            attachment.contentType = 'application/octet-stream';
          }

          // disposition.
          const rawDisposition: unknown = headers?.['content-disposition']?.[0];
          const dispositionStr = typeof rawDisposition === 'string' ? rawDisposition : '';
          attachment.disposition = this.extractDispositionType(dispositionStr);

          // Content-ID → related/embedded.
          if (headers && headers['content-id']) {
            const cidVal = headers['content-id'];
            const cid: string | undefined = Array.isArray(cidVal)
              ? String(cidVal[0])
              : typeof cidVal === 'string'
                ? cidVal
                : undefined;

            if (cid) {
              attachment.contentId = cid;
              attachment.related = true;
            }
          }

          // Read stream content.
          const buffer: Buffer = await this.readStream(att.stream);

          // Size guard: mark as "quarantined" via a metadata flag on the attachment.
          if (buffer.length > this.config.maxAttachmentSize) {
            (attachment as MimeRawAttachment & { quarantined?: boolean }).quarantined = true;
            attachment.contentLength = 0;
            attachment.content = Buffer.alloc(0);
          } else {            attachment.contentLength = buffer.length;
            attachment.content = buffer;
          }

          attachments.push(attachment as MimeRawAttachment);
        } catch (err) {
          // Fallback: quarantined safe entry.
          const _e = err instanceof Error ? err : new Error(String(err));
          void _e;
          if ('quarantined' in att) {
            (att as any).quarantined = true;
          }

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
        // Use our headers map for addresses/subject/date where possible.
        const allHeaders = result.headers?.all ?? {};

        const addrHeader = (key: string): (string | undefined)[] => {
          if (!allHeaders[key]) return [];
          return allHeaders[key];
        };

        // from / to / cc / bcc via header values
        result.from = this.parseAddressesFromHeader(addrHeader('from'));
        result.to = this.parseAddressesFromHeader(addrHeader('to'));
        result.cc = this.parseAddressesFromHeader(addrHeader('cc'));
        const bccVals = addrHeader('bcc');
        if (bccVals.length > 0) {
          result.bcc = this.parseAddressesFromHeader(bccVals);
        } else {
          result.bcc = [];
        }

        // reply-to.
        try {
          const rtVals = addrHeader('reply-to');
          if (rtVals.length > 0) {
            result.replyTo = this.parseAddressesFromHeader(rtVals);
          } else {
            result.replyTo = [];
          }
        } catch {
          result.replyTo = [];
        }

        // Subject: from header or fallback.
        const subjVals = addrHeader('subject');
        if (subjVals && subjVals.length > 0) {
          try {
            result.subject = this.decodeWord(String(subjVals[0]));
          } catch {
            result.subject = String(subjVals[0]);
          }
        } else {
          result.subject = '';
        }

        // Date: prefer header; fallback to now.
        const dateVals = addrHeader('date');
        if (dateVals && dateVals.length > 0) {
          try {
            const parsedDate = new Date(String(dateVals[0]));
            result.date = Number.isFinite(parsedDate.getTime())
              ? parsedDate.toISOString()
              : new Date().toISOString();
          } catch {
            result.date = new Date().toISOString();
          }
        } else {
          // Fallback: now.
          result.date = new Date().toISOString();
        }

        // Text/HTML: we already accumulate from 'data' events; no reliance on private properties.
        const finalTextPlain: string = result.textPlain || '';
        const finalHtml: string = result.html || '';

        // Combine text: prefer unified parser text, else collected plain.
        result.text = result.text || finalTextPlain;
        result.html = finalHtml;
        result.attachments = attachments;

        // Ensure all required fields are present (defensive).
        resolve({
          messageId: result.messageId ?? '',
          subject: result.subject ?? '',
          from: result.from ?? [],
          to: result.to ?? [],
          cc: result.cc ?? [],
          bcc: result.bcc ?? [],
          replyTo: result.replyTo,
          date: result.date ?? new Date().toISOString(),
          inReplyTo: result.inReplyTo,
          references: Array.isArray(result.references) ? result.references : [],
          text: result.text ?? '',
          html: finalHtml,
          textPlain: finalTextPlain,
          attachments,
          headers: result.headers ?? { all: {}, raw: '' },
          rawHeaders: result.rawHeaders ?? '',
        } satisfies ParsedMimeRaw);
      });

      // Pipe message into parser.
      const stream = Readable.from(buf);
      stream.pipe(parser);
    });
  }

  private async readStream(stream: unknown): Promise<Buffer> {
    if (stream instanceof Buffer) return stream;
    if (!stream || (typeof (stream as any)[Symbol.asyncIterator] === 'undefined' && typeof (stream as any).on !== 'function')) {
      return Buffer.alloc(0);
    }

    const chunks: Buffer[] = [];

    // Handle async iterator style.
    const it = stream as AsyncIterable<Buffer>;
    if ((it as any)[Symbol.asyncIterator]) {
      for await (const chunk of it) {
        const b = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
        chunks.push(b);
      }
    } else {
      // Stream-like with 'data'.
      await new Promise<void>((resolve, reject) => {
        (stream as Readable).on('data', (chunk: Buffer | Uint8Array) => {
          chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
        });
        (stream as Readable).on('end', () => resolve());
        (stream as Readable).on('error', reject);
      });
    }

    return Buffer.concat(chunks);
  }

  private buildHeadersMap(headers: Record<string, unknown>): MimeRawHeaders {
    const all: Record<string, string[]> = {};

    for (const [key, value] of Object.entries(headers ?? {})) {
      if (!value) continue;
      const normalizedKey = this.normalizeHeaderName(key);
      let values: string[] = [];

      if (Array.isArray(value)) {
        values = (value as any[]).map(String).filter(Boolean);
      } else if (typeof value === 'string' && value.trim() !== '') {
        values = [value];
      }

      if (values.length > 0) {
        all[normalizedKey] = [...(all[normalizedKey] ?? []), ...values];
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
    // default for unknown/empty to attachment.
    return 'attachment';
  }

  private extractBracketedRefs(v: string): string[] {
    const out: string[] = [];
    const matches = String(v).match(/<[^<>]+>/g);
    if (!matches) return [];
    for (const m of matches) {
      const inner = m.replace(/[<>]/g, '').trim();
      if (inner) out.push(inner);
    }
    return out;
  }

  private splitReferences(v: string): string[] {
    const trimmed = String(v).trim();
    if (!trimmed) return [];

    // Split by commas/semicolons/spaces, then clean.
    return trimmed
      .split(/[,;\s]+/)
      .map((ref) => ref.trim().replace(/[<>]/g, ''))
      .filter(Boolean);
  }

  private normalizeAddresses(arr: (any[] | undefined) | null): MimeAddressEntry[] {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return [];

    const out: MimeAddressEntry[] = [];
    for (const a of arr) {
      try {
        let name = typeof a?.name === 'string' ? (a.name as string) : '';
        if (name) name = this.decodeWord(name);

        let address = String(a?.address ?? a).trim();

        // Remove angle brackets wrapper.
        if (address.startsWith('<') && address.endsWith('>')) {
          address = address.slice(1, -1);
        }

        out.push({
          name: name.trim(),
          address: address.trim(),
        });
      } catch {
        // skip broken entry.
      }
    }
    return out;
  }

  private parseAddressesFromHeader(values: (string | undefined)[]): MimeAddressEntry[] {
    if (!values || values.length === 0) return [];

    const out: MimeAddressEntry[] = [];

    // Simple RFC 5322 style splitter by comma.
    for (const raw of values.map(String)) {
      // Split on commas not inside angle brackets.
      const tokens = this.splitOnCommasOutsideBrackets(raw);
      for (let token of tokens) {
        token = token.trim();
        if (!token) continue;

        let name: string = '';
        let address: string = '';

        // Extract email from angle brackets if present.
        const mAngle = token.match(/<([^>]+)>/);
        if (mAngle && mAngle[1]) {
          address = mAngle[1].trim();
        } else {
          // Assume entire token is the email.
          address = this.stripDisplayParts(token).trim();
        }

        // Extract display name (part before angle brackets) if exists.
        const beforeAngles = token.split('<')[0];
        let displayNameCandidate: string | undefined;

        // Handle "Name <email>" style.
        if (beforeAngles.trim().startsWith('"')) {
          const end = beforeAngles.indexOf('"', 1);
          if (end > 0) {
            displayNameCandidate = beforeAngles.slice(1, end).trim();
          }
        } else if (beforeAngles && beforeAngles.trim()) {
          displayNameCandidate = this.stripDisplayParts(beforeAngles).trim();
        }

        // Don't use email as name.
        const finalName = displayNameCandidate !== address ? this.decodeWord(displayNameCandidate || '') : '';

        if (!address) continue;

        out.push({
          name: finalName,
          address,
        });
      }
    }

    return out;
  }

  private stripDisplayParts(s: string): string {
    // Remove angle-bracketed emails, colons.
    return s.replace(/<[^>]+>/g, '').replace(/^\s*:\s*/, '').trim();
  }

  private splitOnCommasOutsideBrackets(raw: string): string[] {
    const parts: string[] = [];
    let current = '';
    let insideAngle = false;

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '<') { insideAngle = true; current += ch; }
      else if (ch === '>') { insideAngle = false; current += ch; }
      else if (ch === ',' && !insideAngle) {
        parts.push(current);
        current = '';
      } else {
        current += ch;
      }
    }

    if (current.trim()) parts.push(current);
    return parts;
  }

  // Minimal decode helper to avoid importing libmime directly with wrong shape.
  private decodeWord(s: string): string {
    if (!s || typeof s !== 'string') return '';
    try {
      // Handle common RFC2047 encoded-words =?charset*encoding*encoded?=
      const result = String(s).replace(
        /=\?(.*?)\?(Q|B)\?(.*?)\?=/g,
        (_match: string, charset: string, encoding: 'Q' | 'B', text: string) => {
          try {
            const cs = (charset || 'utf-8').trim().toLowerCase();
            if (!text || !encoding) return _match;

            if (encoding === 'B') {
              // Base64.
              return Buffer.from(text, 'base64').toString(cs);
            } else {
              // Quoted-printable-ish: spaces → '+', then decode.
              const qText = text.replace(/_/g, ' ');
              const bytes: number[] = [];
              let i = 0;
              while (i < qText.length) {
                if (qText[i] === '=' && i + 2 <= qText.length) {
                  const hex = qText.slice(i + 1, i + 3);
                  if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
                    bytes.push(parseInt(hex, 16));
                    i += 3;
                    continue;
                  }
                }
                bytes.push(qText.charCodeAt(i));
                i++;
              }
              return Buffer.from(bytes).toString(cs);
            }
          } catch {
            // Fallback to raw.
            return _match;
          }
        }
      );

      return result ? result : s;
    } catch {
      return s;
    }
  }
}