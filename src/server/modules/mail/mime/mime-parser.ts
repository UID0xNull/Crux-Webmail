// ============================================================================
// Crux-Webmail — MIME Parser: Async Streaming Parser (Rewritten)
// ============================================================================
// Desensambla buffers RFC822 crudos en estructuras normalizadas.
// - Usa `mailparser` como transformador de streams con un manejo claro y tipado.
// - Evita `as any` innecesarios; solo se usan casts donde es estrictamente necesario
//   para compatibilidad con mailparser.
// - Interfaz pública ParsedMimeRaw mantenida para no romper mime-pipeline.ts.
// ============================================================================

import MailParser from 'mailparser';
import { Readable } from 'node:stream';
import type { MimeAddress, MimePipelineConfig } from './types';

// ------------------------------------------------------------------
// Public interface used by the rest of the pipeline (no-op changes)
// ------------------------------------------------------------------
export interface ParsedMimeRaw {
  messageId: string;
  subject: string;
  from: MimeAddress[];
  to: MimeAddress[];
  cc: MimeAddress[];
  bcc: MimeAddress[];
  replyTo?: MimeAddress[];
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

export type MimeAddressEntry = MimeAddress;

// ------------------------------------------------------------------
// Attachment metadata as extracted by the parser (pre-validation)
// ------------------------------------------------------------------
export interface MimeRawAttachment {
  filename: string;
  contentType: string;
  contentLength: number;
  content: Buffer;
  contentId?: string;
  disposition: 'inline' | 'attachment';
  related?: boolean;
}

// ------------------------------------------------------------------
// Headers as parsed by mime-parser (used internally and exported)
// ------------------------------------------------------------------
export interface MimeRawHeaders {
  all: Record<string, string[]>;
  raw: string;
}

// ------------------------------------------------------------------
// Internal typed wrappers around mailparser events
// ------------------------------------------------------------------
type MailParserOnHeadersCb = (headers: Record<string, unknown>) => void;
type MailParserOnHeaderCb = (name: string, value: unknown) => void;

// For the 'data' event: mailparser emits objects with fields like type/text/html.
type DataEventPayload = {
  type?: string | boolean | null;
  html?: boolean | string | null;
  text?: string | null;
};

// For the 'attachment' event we rely on mailparser emitting an object
// that carries filename, contentType, contentId and a stream. We wrap it safely.
type AttachmentEventPayload = {
  filename?: string | null;
  contentType?: string | null;
  contentId?: string | null;
  stream?: Readable | Buffer | AsyncIterable<Buffer> | null;
};

// ------------------------------------------------------------------
// MimeParser configuration (subset of global MimePipelineConfig)
// ------------------------------------------------------------------
const MAX_ATTACHMENT = 10 * 1024 * 1024; // 10MB default
export const MAX_MESSAGE_SIZE = 25 * 1024 * 1024; // 25MB default

type MimeParserLocalCfg = Pick<MimePipelineConfig, 'maxMessageSize' | 'maxAttachmentSize'>;

export const DEFAULT_MIME_PARSER_CONFIG: MimeParserLocalCfg = {
  maxMessageSize: MAX_MESSAGE_SIZE,
  maxAttachmentSize: MAX_ATTACHMENT,
};

// ------------------------------------------------------------------
// MimeParser implementation (stable and type-safe)
// ------------------------------------------------------------------
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
    if (rawBuffer.length > this.config.maxMessageSize) {
      throw new Error(
        `Message size ${rawBuffer.length} exceeds max allowed ${this.config.maxMessageSize}`
      );
    }

    // Create a fresh MailParser per parse. Use only stable, documented options.
    const parser = new (MailParser as any)({
      streamAttachments: true, // we collect attachment streams ourselves.
      // No deprecated flags; rely on default behavior for MIME boundary handling.
    });

    return this.processMailParser(parser, rawBuffer);
  }

  private processMailParser(
    parser: any,
    buf: Buffer
  ): Promise<ParsedMimeRaw> {
    return new Promise((resolve, reject) => {
      const result: Partial<ParsedMimeRaw> & { refsSet?: Set<string> } = {};
      const attachments: MimeRawAttachment[] = [];

      // Normalize mailparser headers into our stable structure.
      parser.on('headers' as string, ((h: Record<string, unknown>) => {
        result.headers = this.normalizeHeaders(h);
        try {
          result.rawHeaders = JSON.stringify(h);
        } catch {
          result.rawHeaders = '';
        }
      }) as MailParserOnHeadersCb);

      // Handle individual header lines. Useful for reconstructing multi-value fields.
      parser.on('header' as string, ((name: string, value: unknown) => {
        if (!result.headers) {
          result.headers = { all: {}, raw: '' };
        }

        const normalized = this.normalizeHeaderName(name);

        // Convert value into array of strings.
        let values: (string | number)[];
        if (Array.isArray(value)) {
          values = value as (string | number)[];
        } else if (value != null && String(value).trim() !== '') {
          values = [value as (string | number)];
        } else {
          return;
        }

        const strValues = values.map(String).filter(Boolean);
        if (!result.headers.all[normalized]) {
          result.headers.all[normalized] = [];
        }
        for (const v of strValues) {
          result.headers.all[normalized].push(v);
        }

        // Extract specific known headers where convenient.
        const key = normalized.toLowerCase();
        if (key === 'message-id') {
          if (!result.messageId && strValues.length > 0) {
            result.messageId = this.bracketTrim(strValues[0] as string) || '';
          }
        } else if (key === 'in-reply-to') {
          if (!result.inReplyTo && strValues.length > 0) {
            const refs = this.extractBracketedRefs(String(strValues[0]));
            result.inReplyTo = refs[0] ?? undefined;
          }
        } else if (key === 'references') {
          for (const val of strValues) {
            const refs = this.splitReferences(String(val));
            if (!result.refsSet) result.refsSet = new Set<string>();
            for (const ref of refs) result.refsSet.add(ref);
          }
        }
      }) as MailParserOnHeaderCb);

      // Handle text/html data parts.
      parser.on('data' as string, ((obj: DataEventPayload | Record<string, unknown>) => {
        if (!obj || typeof obj !== 'object') return;
        const d = obj as DataEventPayload;

        const typeField = typeof d.type === 'string' ? d.type : null;
        // mailparser can use html:true or type:'html'.
        const isHtml =
          d.html === true || (d.html !== false && String(d.html ?? '').toLowerCase() === 'true')
          || typeField?.toString().trim().toLowerCase() === 'html';

        const text = typeof d.text === 'string' ? d.text : null;
        if (!text) return;

        if (isHtml) {
          result.html = (result.html ?? '') + text;
        } else {
          // Non-HTML: treat as plain.
          result.textPlain = (result.textPlain ?? '') + text;
        }
      }) as (cb: (obj: unknown) => void) => void);

      // Handle attachment events — wrap in IIFE so parser.on receives a regular callback.
      parser.on('attachment' as string, ((att: AttachmentEventPayload | Record<string, unknown>) => {
        (async () => {
          try {
            const a = att as AttachmentEventPayload;

            let filename: string | undefined =
              typeof (a as any).filename === 'string' && String((a as any).filename || '').trim()
                ? (a as any).filename
                : // Some mailparser versions expose name.
                  typeof (a as any).name === 'string' && String((a as any).name || '').trim()
                    ? (a as any).name
                    : undefined;

            filename = filename ? this.decodeWord(filename) : '';
            if (!filename || !filename.trim()) {
              filename = 'attachment';
            }

            // Determine content-type.
            let contentType: string = typeof a.contentType === 'string'
              ? (a as any).contentType?.toString().trim() || ''
              : '';
            if (!contentType) {
              contentType = 'application/octet-stream';
            }

            const streamCandidate = (att as AttachmentEventPayload).stream ?? (a as any).stream;
            const buffer = await this.readStream(streamCandidate);

            const contentLength =
              buffer.length > 0 && buffer.length <= this.config.maxAttachmentSize
                ? buffer.length
                : 0;

            // If too large, still record it but with zeroed content to avoid OOM.
            const safeContent: Buffer =
              buffer.length <= this.config.maxAttachmentSize ? buffer : Buffer.alloc(0);

            attachments.push({
              filename: filename ?? 'attachment',
              contentType,
              contentLength,
              content: safeContent,
              contentId: typeof a.contentId === 'string' && String(a.contentId || '').trim()
                ? (a as any).contentId?.toString().trim() ?? undefined
                : undefined,
              disposition: this.extractDispositionType(String((a as any).disposition ?? '')),
            });
          } catch {
            // Fallback quarantined-safe attachment.
            attachments.push({
              filename: 'quarantined-attachment',
              contentType: 'application/octet-stream',
              contentLength: 0,
              content: Buffer.alloc(0),
              disposition: 'attachment',
            });
          }
        })().catch(() => {
          // Silently handle uncaught errors in attachment processing.
        });
      }) as (cb: (att: unknown) => void) => void);

      parser.on('error' as string, (err: any) => reject(err));

      // When mailparser finishes parsing.
      parser.on('end' as string, async () => {
        try {
          const allHeaders = result.headers?.all ?? {};

          const headerValues = (key: string): (string | undefined)[] =>
            allHeaders[key] || [];

          // Addresses from headers
          result.from = this.parseAddressesFromHeader(headerValues('from'));
          result.to   = this.parseAddressesFromHeader(headerValues('to'));
          result.cc   = this.parseAddressesFromHeader(headerValues('cc'));
          const bccVals = headerValues('bcc');
          if (bccVals.length > 0) {
            result.bcc = this.parseAddressesFromHeader(bccVals);
          } else {
            result.bcc = [];
          }

          // reply-to
          try {
            const rtVals = headerValues('reply-to');
            if (rtVals.length > 0) {
              result.replyTo = this.parseAddressesFromHeader(rtVals);
            } else {
              result.replyTo = [];
            }
          } catch {
            result.replyTo = [];
          }

          // subject: decode encoded-words
          const subjVals = headerValues('subject');
          if (subjVals.length > 0) {
            try {
              result.subject = this.decodeWord(String(subjVals[0]));
            } catch {
              result.subject = String(subjVals[0]);
            }
          } else {
            result.subject = '';
          }

          // date: prefer header value; fallback to now.
          const dateVals = headerValues('date');
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
            result.date = new Date().toISOString();
          }

          // references: turn collected set or existing list into a clean array.
          let refs: string[] | undefined;
          if (result.refsSet && result.refsSet instanceof Set) {
            try {
              const s = result.refsSet as Set<string>;
              refs = [...s.values()];
            } catch {
              refs = Array.isArray(result.references) ? result.references.filter(Boolean) : [];
            }
          }

          if (refs && refs.length > 0) {
            result.references = refs;
          } else if (result.references && Array.isArray(result.references)) {
            result.references = result.references.filter(Boolean);
          } else {
            result.references = [];
          }

          // Text/HTML: finalize from accumulated parts.
          const finalHtml = result.html || '';
          const finalTextPlain = result.textPlain || '';

          // If mailparser already exposed text, merge it as fallback for unified plaintext.
          if (!result.text) {
            result.text = finalTextPlain;
          }

          // Ensure we write out all required fields defensively.
          resolve({
            messageId: String(result.messageId ?? ''),
            subject: String(result.subject ?? ''),
            from: Array.isArray(result.from) ? result.from : [],
            to:   Array.isArray(result.to)   ? result.to   : [],
            cc:   Array.isArray(result.cc)   ? result.cc   : [],
            bcc:  Array.isArray(result.bcc)  ? result.bcc  : [],
            replyTo:
              (Array.isArray(result.replyTo) && result.replyTo.length > 0
                ? result.replyTo as MimeAddress[]
                : []) as MimeAddress[],
            date: String(result.date ?? new Date().toISOString()),
            inReplyTo: typeof result.inReplyTo === 'string' && result.inReplyTo.trim()
              ? result.inReplyTo
              : undefined,
            references: Array.isArray(result.references) ? (result.references as string[]) : [],
            text: String(finalTextPlain ?? ''),
            html: finalHtml,
            textPlain: finalTextPlain,
            attachments,
            headers: result.headers ?? { all: {}, raw: '' },
            rawHeaders: String(result.rawHeaders ?? ''),
          });

        } catch (err) {
          reject(err);
        }
      });

      // Feed buffer into mailparser.
      const src = Readable.from(buf);
      src.pipe(parser);
    });
  }

  private readStream(stream: unknown): Promise<Buffer> {
    if (!stream) return Promise.resolve(Buffer.alloc(0));
    if (stream instanceof Buffer) return Promise.resolve(stream);

    // If it is an async iterator, consume that.
    const ai = stream as AsyncIterable<Buffer>;
    if ((ai as any)[Symbol.asyncIterator]) {
      return (async () => {
        const parts: Buffer[] = [];
        for await (const chunk of ai) {
          parts.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(parts);
      })();
    }

    // If it's a classic Readable-like stream, consume with events.
    const s = stream as Readable;
    if (typeof s.on === 'function') {
      return new Promise((resolve, reject) => {
        const parts: Buffer[] = [];
        s.on('data', (chunk: any) => {
          const b = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
          parts.push(b);
        });
        s.on('end', () => resolve(Buffer.concat(parts)));
        s.on('error', reject);
      });
    }

    // Fallback: treat as static content.
    return Promise.resolve(Buffer.from(String(stream ?? '')));
  }

  private normalizeHeaders(h: Record<string, unknown>): MimeRawHeaders {
    const all: Record<string, string[]> = {};

    for (const [key, value] of Object.entries(h ?? {})) {
      if (!value) continue;
      const normalizedKey = this.normalizeHeaderName(key);

      let values: (string | number)[];
      if (Array.isArray(value)) {
        values = value as (string | number)[];
      } else if (typeof value === 'string' && value.trim() !== '') {
        values = [value];
      } else {
        continue;
      }

      const strValues = values.map(String).filter(Boolean);
      if (!strValues.length) continue;

      all[normalizedKey] = [...(all[normalizedKey] || []), ...strValues];
    }

    return { all, raw: '' };
  }

  private normalizeHeaderName(name: string): string {
    if (!name) return '';
    return name
      .trim()
      .toLowerCase()
      // camelCase to kebab-case for weird mailparser outputs.
      .replace(/([a-z])([A-Z])/g, '$1-$2')
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
    // Split by whitespace and punctuation.
    return trimmed
      .split(/[,;\s]+/)
      .map((ref) => ref.trim().replace(/[<>]/g, ''))
      .filter(Boolean);
  }

  private parseAddressesFromHeader(values: (string | undefined)[]): MimeAddressEntry[] {
    if (!values || values.length === 0) return [];

    const out: MimeAddressEntry[] = [];

    for (const raw of values.map(String)) {
      // Split on commas not inside angle brackets.
      const tokens = this.splitOnCommasOutsideBrackets(raw);
      for (let token of tokens) {
        token = token.trim();
        if (!token) continue;

        let name: string = '';
        let address: string = '';

        // Extract email from angle brackets.
        const mAngle = token.match(/<([^>]+)>/);
        if (mAngle && mAngle[1]) {
          address = mAngle[1].trim();
        } else {
          // Assume entire token is the address, strip display fluff.
          address = this.stripDisplayParts(token).trim();
        }

        // Extract name from before angle brackets or quoted string.
        const beforeAngles = (token.split('<')[0] ?? '').trim();

        let displayNameCandidate: string | undefined;

        if (beforeAngles.trim().startsWith('"')) {
          const end = beforeAngles.indexOf('"', 1);
          if (end > 0) {
            displayNameCandidate = beforeAngles.slice(1, end).trim();
          }
        } else if (beforeAngles && this.isNameLike(beforeAngles)) {
          // If there's text that doesn't look purely like an email.
          const stripped = this.stripDisplayParts(beforeAngles).trim();
          if (stripped && !/^\S+\@\S+\.\S+$/.test(stripped.toLowerCase())) {
            displayNameCandidate = stripped;
          }
        }

        // If name equals address, treat as no meaningful display name.
        const finalName =
          displayNameCandidate != null &&
          String(displayNameCandidate).trim() !== '' &&
          displayNameCandidate.trim().toLowerCase() !== address.toLowerCase()
            ? this.decodeWord(displayNameCandidate)
            : '';

        if (!address || /^\s*\S+\@\S+\.\S+\s*$/.test(address) === false) {
          // If it doesn't look like a valid email pattern, skip.
          continue;
        }

        out.push({
          name: finalName.trim(),
          address: address.trim(),
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

  private isNameLike(s: string): boolean {
    // Very coarse heuristic.
    const t = s.trim();
    // If looks like pure email, it's not a name-like bit alone.
    if (/^\S+\@\S+\.\S+$/.test(t)) return false;
    return true;
  }

  private bracketTrim(v: string): string {
    const t = v.trim();
    return (t.startsWith('<') && t.endsWith('>')) ? t.slice(1, -1).trim() : t;
  }

  // RFC2047 style decode: =?charset?encoding?text?=
  private decodeWord(s: string): string {
    if (!s || typeof s !== 'string') return '';
    try {
      const result = String(s).replace(
        /=\?(.*?)\?(Q|B)\?(.*?)\?=/g,
        (_match: string, charset: string, encoding: 'Q' | 'B', text: string) => {
          try {
            const cs = (charset || 'utf-8').trim().toLowerCase();
            if (!text || !encoding) return _match;

            if (encoding === 'B') {
              return Buffer.from(text, 'base64').toString(cs as BufferEncoding);
            } else {
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
              return Buffer.from(bytes).toString(cs as BufferEncoding);
            }
          } catch {
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