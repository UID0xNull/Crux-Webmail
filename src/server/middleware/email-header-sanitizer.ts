// ============================================================================
// Crux-Webmail — Email Header Injection Prevention Middleware
// ============================================================================
// OWASP Header Injection (CWE-117) en campos de email headers.
// Intercepta Subject, From, To, CC, BCC y headers custom antes del SMTP bridge.
// Elimina CRLF injection, newline escapes, y headers inyectados.
// ============================================================================

import { FastifyPluginCallback } from 'fastify';
import { auditLogger } from 'utils/audit-logger';

// ------------------------------------------------------------------
// Pattern: CRLF injection en email headers
// Detecta \n, \r, %0A, %0D, y variantes encoding
// ------------------------------------------------------------------
const HEADER_INJECTION_PATTERNS = [
  /\r\n/g,
  /\n/g,
  /\r/g,
  /%0[aAdD]/gi,
  /\\n/g,
  /\\r/g,
  /[\x00-\x08\x0B\x0C\x0E-\x1F]/g, // Control chars except valid whitespace
];

// Headers de email permitidos para passthrough directo
const SAFE_EMAIL_HEADERS = new Set([
  'subject', 'from', 'to', 'cc', 'bcc', 'reply-to',
  'date', 'message-id', 'in-reply-to', 'references',
  'priority', 'importance', 'content-type', 'mime-version',
]);

// Longitud máxima por header (RFC 5321 recommendation)
const MAX_HEADER_LENGTH = 998;
const MAX_HEADERS_COUNT = 20;

interface SanitizedEmailHeaders {
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string;
  customHeaders: Record<string, string>;
  injectedHeadersRemoved: number;
}

// ------------------------------------------------------------------
// Sanitizar un solo valor de header
// ------------------------------------------------------------------
export function sanitizeEmailHeaderValue(value: string): string {
  if (!value) return '';

  let sanitized = value;

  // Strip CRLF injection characters
  for (const pattern of HEADER_INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, '');
  }

  // Remove URL-encoded injection
  sanitized = sanitized.replace(/%0[aAdD]/gi, '');

  // Trim and truncate
  sanitized = sanitized.trim();
  if (sanitized.length > MAX_HEADER_LENGTH) {
    sanitized = sanitized.substring(0, MAX_HEADER_LENGTH);
  }

  return sanitized;
}

// ------------------------------------------------------------------
// Validar email address (RFC 5322 simplified)
// ------------------------------------------------------------------
function isValidEmailAddress(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9]{2,})+$/;
  return emailRegex.test(email);
}

// ------------------------------------------------------------------
// Parsear y sanitizar lista de recipients
// ------------------------------------------------------------------
export function sanitizeRecipients(recipients: string | string[]): string[] {
  if (!recipients) return [];

  // Parse string or array
  const emailList: string[] = Array.isArray(recipients) ? recipients : [recipients];

  return emailList
    .map(email => sanitizeEmailHeaderValue(email))
    .filter(email => email.length > 0 && isValidEmailAddress(email))
    .map(email => email.toLowerCase())
    .filter((email, idx, arr) => arr.indexOf(email) === idx); // Unique
}

// ------------------------------------------------------------------
// Validar y sanitizar un conjunto completo de headers de email
// ------------------------------------------------------------------
export function sanitizeEmailHeaders(
  headers: Record<string, unknown>
): { sanitized: SanitizedEmailHeaders; isValid: boolean; violations?: string[] } {
  const violations: string[] = [];
  let injectedRemoved = 0;

  const rawSubject = String(headers.subject || '').slice(0, 998);
  const rawFrom = String(headers.from || '').slice(0, 998);
  const rawTo = headers.to;
  const rawCc = headers.cc;
  const rawBcc = headers.bcc;
  const rawReplyTo = String(headers.replyTo || headers.reply_to || '').slice(0, 998);

  // Check for header injection in all string values
  const checkInjection = (value: string, fieldName: string): boolean => {
    if (!value) return true;

    for (const pattern of HEADER_INJECTION_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(value)) {
        violations.push(`Header injection detected in "${fieldName}"`);
        return false;
      }
    }
    return true;
  };

  // Validate all inputs for injection
  let allClean = true;
  if (!checkInjection(rawSubject, 'subject')) allClean = false;
  if (!checkInjection(rawFrom, 'from')) allClean = false;
  if (!checkInjection(rawReplyTo, 'reply-to')) allClean = false;

  const toList = Array.isArray(rawTo) ? rawTo : [rawTo];
  const ccList = Array.isArray(rawCc) ? rawCc : rawCc ? [rawCc] : [];
  const bccList = Array.isArray(rawBcc) ? rawBcc : rawBcc ? [rawBcc] : [];

  for (const t of toList) {
    if (!checkInjection(String(t), 'to')) allClean = false;
  }
  for (const c of ccList) {
    if (!checkInjection(String(c), 'cc')) allClean = false;
  }
  for (const b of bccList) {
    if (!checkInjection(String(b), 'bcc')) allClean = false;
  }

  // Validate 'from' email format
  const sanitizedFrom = sanitizeEmailHeaderValue(rawFrom);
  if (sanitizedFrom && !isValidEmailAddress(sanitizedFrom)) {
    violations.push('Invalid "from" email address format');
    allClean = false;
  }

  // Validate reply-to format
  const sanitizedReplyTo = sanitizeEmailHeaderValue(rawReplyTo);
  if (sanitizedReplyTo && !isValidEmailAddress(sanitizedReplyTo)) {
    violations.push('Invalid "reply-to" email address format');
    allClean = false;
  }

  // Custom headers: validate count and content
  const customHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SAFE_EMAIL_HEADERS.has(lowerKey)) continue;
    if (lowerKey.startsWith('x-')) {
      // X- headers are allowed if they don't contain injection
      const sanitizedVal = String(value || '');
      for (const pattern of HEADER_INJECTION_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(sanitizedVal)) {
          injectedRemoved++;
          allClean = false;
          break;
        }
      }
      customHeaders[key] = sanitizeEmailHeaderValue(sanitizedVal);
    } else {
      injectedRemoved++;
    }
  }

  if (Object.keys(customHeaders).length + Object.keys(headers).length > MAX_HEADERS_COUNT) {
    violations.push(`Too many headers (max ${MAX_HEADERS_COUNT})`);
    allClean = false;
  }

  const sanitized: SanitizedEmailHeaders = {
    subject: sanitizeEmailHeaderValue(rawSubject),
    from: sanitizedFrom,
    to: sanitizeRecipients(toList),
    cc: sanitizeRecipients(ccList),
    bcc: sanitizeRecipients(bccList),
    replyTo: sanitizedReplyTo,
    customHeaders,
    injectedHeadersRemoved: injectedRemoved,
  };

  return { sanitized, isValid: allClean, violations };
}

// ------------------------------------------------------------------
// Fastify preHandler para rutas de envío de email
// ------------------------------------------------------------------
const emailHeaderSanitizerPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.addHook('preHandler', async (request: any, reply: any) => {
    const path = request.url;
    const method = request.method;

    // Solo interceptar rutas POST/PUT de envío de email
    if (
      method !== 'POST' && method !== 'PUT'
    ) return;

    if (
      !path.includes('/api/mail/send') &&
      !path.includes('/api/email/send') &&
      !path.includes('/api/jmap/EmailSubmission')
    ) return;

    try {
      const body = request.body;
      if (!body) return;

      // Headers a validar pueden estar en body.headers, body.mail_options, o directamente en body
      const emailHeaders = body.headers || body.mail_options?.headers || {
        subject: body.subject,
        from: body.from || body.sender,
        to: body.to,
        cc: body.cc,
        bcc: body.bcc,
        replyTo: body.replyTo,
      };

      const result = sanitizeEmailHeaders(emailHeaders);

      if (!result.isValid) {
        auditLogger.critical('Email header injection attempt blocked', {
          actor_id: (request as any).secureContext?.user_id || 'unknown',
          session_id: request.id,
          client_ip: request.ip,
          metadata: {
            violations: result.violations,
            injected_headers_removed: result.sanitized.injectedHeadersRemoved,
            path,
          },
        });

        // En producción: rechazar completamente
        if (process.env.NODE_ENV === 'production') {
          return reply.status(400).send({
            status: 400,
            code: 'HEADER_INJECTION_DETECTED',
            message: 'Potentially malicious content detected in email headers. Message rejected.',
            correlation_id: request.id,
            details: {
              violations: result.violations?.length,
            },
          });
        }

        // En desarrollo: sanitizar y continuar con warning
        fastify.log.warn('Email headers sanitized', {
          violations: result.violations,
        });

        // Reemplazar body con headers sanitizados
        if (body.headers) {
          body.headers = {
            subject: result.sanitized.subject,
            from: result.sanitized.from,
            to: result.sanitized.to,
            cc: result.sanitized.cc,
            bcc: result.sanitized.bcc,
            'reply-to': result.sanitized.replyTo,
            ...result.sanitized.customHeaders,
          };
        } else {
          body.subject = result.sanitized.subject;
          body.from = result.sanitized.from;
          body.to = result.sanitized.to;
          body.cc = result.sanitized.cc;
          body.bcc = result.sanitized.bcc;
          body.replyTo = result.sanitized.replyTo;
        }
      }
    } catch (err) {
      auditLogger.error('Email header sanitizer error', {
        metadata: { error: (err as Error).message },
      });
    }
  });

  done();
};

export { emailHeaderSanitizerPlugin };