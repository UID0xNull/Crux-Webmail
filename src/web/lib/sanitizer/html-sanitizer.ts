// ============================================================================
// Crux-Webmail Frontest — HTML Sanitizer (Client-side)
// Defense-in-depth: DOMPurify + CSP nonce + iframe sandbox
// Preparado para WASM sanitizer migratorio
// ============================================================================

import createDOMPurify from 'dompurify';

// ------------------------------------------------------------------
// DOMPurify configuration
// ------------------------------------------------------------------

const purify =
  typeof document !== 'undefined'
    ? createDOMPurify(window)
    : null;

export interface SanitizeOptions {
  /** Allow inline images via data: URIs */
  allowImages?: boolean;
  /** Allow limited CSS */
  allowStyles?: boolean;
  /** Allow tables (for email formatting) */
  allowTables?: boolean;
  /** Strictest mode: strip everything except text structure */
  strict?: boolean;
}

const DEFAULT_OPTIONS: SanitizeOptions = {
  allowImages: true,
  allowStyles: true,
  allowTables: true,
  strict: false,
};

// ------------------------------------------------------------------
// Allowed tags / attributes / protocols
// ------------------------------------------------------------------

const ALLOWED_TAGS = [
  // Structure
  'DIV', 'SPAN', 'P', 'BR', 'HR', 'BLOCKQUOTE', 'PRE', 'CODE',
  // Lists
  'UL', 'OL', 'LI',
  // Headings
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  // Tables (email formatting)
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION',
  // Links
  'A',
  // Images
  'IMG',
  // Inline
  'B', 'I', 'U', 'S', 'STRONG', 'EM', 'SUB', 'SUP', 'MARK',
  // Line breaks
  'WBR',
  // Sections
  'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN',
];

const ALLOWED_ATTR = [
  'href', 'title', 'alt', 'src',
  'class', 'id',
  'style',
  'width', 'height', 'align', 'valign',
  'border', 'cellpadding', 'cellspacing',
  'bgcolor', 'background',
  'target', 'rel',
  'lang', 'dir',
  'colspan', 'rowspan',
  'abbr', 'datetime',
];

const ALLOWED_PROTOCOLS = [
  'http', 'https', 'mailto', 'tel', 'ftp', 'data',
];

// ------------------------------------------------------------------
// CSS properties allowed (minimal set for email rendering)
// ------------------------------------------------------------------

const ALLOWED_CSS_PROPS = new Set([
  'color', 'background-color', 'background', 'border', 'border-color',
  'border-radius', 'border-collapse', 'border-spacing',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-decoration',
  'text-transform', 'white-space', 'word-wrap', 'word-break',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'display', 'visibility', 'float', 'clear', 'overflow',
  'width', 'height', 'max-width', 'min-width', 'max-height',
  'box-shadow', 'opacity', 'cursor', 'outline',
  'list-style', 'list-style-type',
  'vertical-align',
  'text-indent',
  'background-image', 'background-size', 'background-position', 'background-repeat',
]);

// ------------------------------------------------------------------
// Sanitize HTML content
// ------------------------------------------------------------------

export function sanitizeHtml(
  html: string,
  options: SanitizeOptions = DEFAULT_OPTIONS
): string {
  if (!html) return '';

  if (typeof purify === 'undefined') {
    // SSR fallback: return empty (no sanitization on server)
    return '';
  }

  // Clone options
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Configure DOMPurify
  purify.setConfig({
    ADD_TAGS: opts.allowTables ? [] : [],
    ALLOWED_TAGS: opts.strict ? ['P', 'BR', 'B', 'I', 'A'] : ALLOWED_TAGS,
    ALLOWED_ATTR: opts.strict
      ? ['href', 'rel']
      : ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: new RegExp(
      `^(${ALLOWED_PROTOCOLS.join('|')})://`,
      'i'
    ),
    ALLOW_DATA_URI: opts.allowImages,
    KEEP_CONTENT: true,
    FORBID_TAGS: ['SCRIPT', 'FRAME', 'IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });

  let clean = purify.sanitize(html);

  // Additional defense: strip dangerous patterns DOMPurify might miss
  clean = stripDangerousPatterns(clean);

  // Validate CSS if styles are allowed
  if (!opts.strict && opts.allowStyles) {
    clean = validateInlineStyles(clean);
  }

  return clean;
}

// ------------------------------------------------------------------
// Strip dangerous patterns (defense-in-depth)
// ------------------------------------------------------------------

function stripDangerousPatterns(html: string): string {
  return html
    // Strip JavaScript URIs
    .replace(/javascript\s*:/gi, '')
    // Strip vbscript URIs
    .replace(/vbscript\s*:/gi, '')
    // Strip data: URIs with script content
    .replace(/data\s*:\s*text\/html/gi, 'data:application/x-blocked')
    // Strip SVG-based attacks
    .replace(/<svg[^>]*>.*?<\/svg>/gis, '[SVG]')
    // Strip expressions() CSS
    .replace(/expression\s*\(/gi, '')
    // Strip url() in CSS that points to non-whitelisted protocols
    .replace(/url\s*\(\s*['"]\s*javascript\s*:/gi, 'url()')
    // Strip @import CSS rules
    .replace(/@import/gi, '')
    // Strip behavior CSS property (IE)
    .replace(/behavior\s*:/gi, '')
    // Strip -moz-binding
    .replace(/-moz-binding\s*:/gi, '');
}

// ------------------------------------------------------------------
// Validate inline CSS styles
// ------------------------------------------------------------------

function validateInlineStyles(html: string): string {
  // Parse and validate style attributes
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  doc.querySelectorAll('[style]').forEach((element) => {
    const style = element.getAttribute('style') ?? '';
    const allowedDeclarations = style
      .split(';')
      .map((decl) => decl.trim())
      .filter((decl) => {
        if (!decl) return false;
        const prop = decl.split(':')[0].trim().toLowerCase();
        return ALLOWED_CSS_PROPS.has(prop);
      })
      .join('; ');

    element.setAttribute('style', allowedDeclarations);
  });

  // Serialize back
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc.body);
}

// ------------------------------------------------------------------
// Sanitize email addresses
// ------------------------------------------------------------------

export function sanitizeEmail(email: string): string {
  if (!email) return '';
  return email
    .toLowerCase()
    .trim()
    .replace(/[^a-zA-Z0-9._%+-@]/g, '');
}

// ------------------------------------------------------------------
// Sanitize display names
// ------------------------------------------------------------------

export function sanitizeDisplayName(name: string): string {
  if (!name) return '';
  // Allow unicode for international names
  return name
    .slice(0, 255)
    .replace(/[<>"'&]/g, '');
}

// ------------------------------------------------------------------
// Validate MIME type for attachments
// ------------------------------------------------------------------

const SAFE_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/csv', 'text/calendar',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-tar',
  'application/gzip',
]);

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.ps1', '.vbs', '.js', '.html', '.htm',
  '.hta', '.msi', '.scr', '.pif', '.inf', '.reg', '.com', '.cmd',
  '.sh', '.csh', '.ksh', '.bash', '.zsh',
  '.php', '.asp', '.aspx', '.jsp', '.cgi',
  '.jar', '.class', '.dll', '.so', '.dylib',
  '.docm', '.xlsm', '.pptm', '.enablemacro',
  '.jar', '.app', '.apk', '.ipa',
]);

export function isSafeAttachment(
  mimeType: string,
  filename: string
): boolean {
  const mime = mimeType.toLowerCase().trim();
  const name = filename.toLowerCase();

  // Check MIME
  if (!SAFE_MIME_TYPES.has(mime)) {
    // Allow all image/* subtypes
    if (!mime.startsWith('image/')) {
      return false;
    }
  }

  // Check extension
  for (const ext of DANGEROUS_EXTENSIONS) {
    if (name.endsWith(ext)) return false;
  }

  return true;
}

// ------------------------------------------------------------------
// WASM Sanitizer Interface (future migration target)
// ------------------------------------------------------------------

export interface WASMSanitizer {
  sanitize(html: ArrayBuffer): ArrayBuffer;
  version(): string;
}

// TODO: Load WASM sanitizer module
// export async function loadWASMSanitizer(): Promise<WASMSanitizer> {
//   const wasmModule = await import('../wasm/sanitizer.wasm');
//   return wasmModule.instance.exports;
// }
---CODE---