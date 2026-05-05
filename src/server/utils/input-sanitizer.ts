// ============================================================================
// Crux-Webmail — Input Sanitization Utility
// ============================================================================
// Sanitiza inputs de usuario antes de persistencia/procesamiento.
// Remueve tags HTML, normaliza strings, valida longitudes.
// ============================================================================

// ------------------------------------------------------------------
// Strip HTML tags — remueve todo markup HTML de strings
// ------------------------------------------------------------------

export function stripHtml(input: string): string {
  if (!input) return '';
  return input.replace(/<[^>]*>/g, '');
}

// ------------------------------------------------------------------
// Sanitizar campo de texto plano — para subjects, names, etc.
// ------------------------------------------------------------------

export function sanitizePlainText(
  input: string,
  options: { maxLength?: number; allowHtml?: boolean } = {}
): string {
  const { maxLength = 10000, allowHtml = false } = options;
  if (!input) return '';

  let sanitized = input;

  if (!allowHtml) {
    sanitized = stripHtml(sanitized);
  }

  // Strip null bytes — common in injection attacks
  sanitized = sanitized.replace(/\0/g, '');

  // Trim and truncate
  sanitized = sanitized.trim().slice(0, maxLength);

  return sanitized;
}

// ------------------------------------------------------------------
// Sanitizar email body (texto)
// ------------------------------------------------------------------

export function sanitizeEmailBody(input: string): string {
  if (!input) return '';
  // Allow basic text but strip null bytes and control chars
  return input
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
}

// ------------------------------------------------------------------
// Sanitizar HTML body de email (para emails HTML)
// ------------------------------------------------------------------

export function sanitizeEmailHtml(input: string): string {
  if (!input) return '';

  // Strip null bytes and control chars first
  let sanitized = input
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // Strip <script> tags (including malformed variants)
  sanitized = sanitized.replace(/<\s*script[^>]*>.*?<\s*\/\s*script\s*>/gis, '');
  sanitized = sanitized.replace(/<\s*script[^>]*>/gi, '[SCRIPT REMOVED]');

  // Strip event handlers on all tags (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*\S+/gi, '');

  // Strip javascript: protocol
  sanitized = sanitized.replace(/javascript\s*:/gi, '');

  // Strip vbscript: protocol
  sanitized = sanitized.replace(/vbscript\s*:/gi, '');

  // Strip data: URIs in img/src (except for safe image types)
  sanitized = sanitized.replace(
    /src\s*=\s*["']data\s*:\s*text\/[^"']*["']/gi,
    'src=""'
  );

  // Strip base tags — can redirect relative URLs
  sanitized = sanitized.replace(/<\s*base[^>]*>/gi, '');

  // Strip iframe/embed/object
  sanitized = sanitized.replace(/<\s*(iframe|embed|object|video|audio|form)[^>]*>.*?<\s*\/\s*\1\s*>/gis, '');
  sanitized = sanitized.replace(/<\s*(iframe|embed|object|video|audio|form)[^>]*\/?>/gi, '');

  // Strip CSS expressions (IE)
  sanitized = sanitized.replace(/expression\s*\(/gi, '');
  sanitized = sanitized.replace(/-moz-binding\s*:/gi, '');
  sanitized = sanitized.replace(/behavior\s*:/gi, '');

  // Strip @import in style blocks
  sanitized = sanitized.replace(/<style[^>]*>.*?@import[^;]*;[^<]*<\/style>/gis, '<style></style>');

  return sanitized;
}

// ------------------------------------------------------------------
// Validate and sanitize file upload fields
// ------------------------------------------------------------------

export interface FileValidationResult {
  valid: boolean;
  sanitizedFilename?: string;
  reason?: string;
}

export function validateFilename(filename: string): FileValidationResult {
  if (!filename || filename.length === 0) {
    return { valid: false, reason: 'Filename is empty' };
  }

  if (filename.length > 255) {
    return { valid: false, reason: 'Filename exceeds 255 character limit' };
  }

  // Normalize filename: replace path separators and whitespace runs
  let sanitized = filename
    .replace(/[\/\\]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip leading dots (hidden files in Unix)
  while (sanitized.startsWith('.')) {
    sanitized = sanitized.substring(1);
  }

  // Strip control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

  if (sanitized.length === 0) {
    return { valid: false, reason: 'Filename contains only invalid characters' };
  }

  return { valid: true, sanitizedFilename: sanitized };
}

// ------------------------------------------------------------------
// XSS Protection Patterns — detect potentially malicious content
// ------------------------------------------------------------------

const XSS_PATTERNS = [
  /<\s*script/gi,
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /on\w+\s*=/gi,
  /<\s*iframe/gi,
  /<\s*object/gi,
  /<\s*embed/gi,
  /<\s*link[^>]*(href|import)/gi,
  /<\s*form/gi,
  /<\s*svg[^>]*onload/gi,
  /expression\s*\(/gi,
  /url\s*\(\s*['"]\s*javascript/gi,
  /@import/gi,
];

/**
 * Detect potential XSS payload in a string.
 * Returns true if malicious patterns are detected.
 */
export function detectXssPayload(input: string): boolean {
  if (!input) return false;

  // Fast path: if no angle brackets, XSS is unlikely
  if (!input.includes('<')) {
    return false;
  }

  for (const pattern of XSS_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(input)) {
      return true;
    }
  }

  return false;
}

// ------------------------------------------------------------------
// SQL Injection patterns (defense-in-depth para strings freeform)
// ------------------------------------------------------------------

const SQLI_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b.*\b(FROM|INTO|TABLE|DATABASE|WHERE)\b)/gi,
  /(--|#|\/\*)/g,
  /';?\s*(DROP|DELETE|UPDATE|INSERT)/gi,
];

export function detectSqliPayload(input: string): boolean {
  if (!input) return false;

  for (const pattern of SQLI_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(input)) {
      return true;
    }
  }

  return false;
}

// ------------------------------------------------------------------
// Command Injection patterns
// ------------------------------------------------------------------

const CMD_INJECTION_PATTERNS = [
  /;\s*(rm|cat|ls|wget|curl|bash|sh|chmod|chown)/gi,
  /\|\s*(rm|cat|ls|bash|sh)/gi,
  /`[^`]+`/g,
  /\$\([^)]+\)/g,
  /&&\s*(rm|bash|sh)/gi,
];

export function detectCommandInjection(input: string): boolean {
  if (!input) return false;

  for (const pattern of CMD_INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(input)) {
      return true;
    }
  }

  return false;
}