// ============================================================================
// Crux-Webmail — SSRF Protection Utility
// ============================================================================
// Valida IPs/URLs contra rangos privados, links-locales, reserved y blacklisted.
// Previene Server-Side Request Forgery en conexiones outbound.
// ============================================================================

import { URL } from 'node:url';
import { promisify } from 'node:util';
import dns from 'node:dns';
import net from 'node:net';

const dnsLookup = promisify(dns.lookup);

// ------------------------------------------------------------------
// Rango de IPs privadas/reservadas a bloquear
// ------------------------------------------------------------------

const PRIVATE_RANGES = [
  // 10.0.0.0/8
  { cidr: '10.0.0.0', mask: '255.0.0.0' },
  // 172.16.0.0/12
  { cidr: '172.16.0.0', mask: '255.240.0.0' },
  // 192.168.0.0/16
  { cidr: '192.168.0.0', mask: '255.255.0.0' },
  // 127.0.0.0/8 (loopback)
  { cidr: '127.0.0.0', mask: '255.0.0.0' },
  // 169.254.0.0/16 (link-local)
  { cidr: '169.254.0.0', mask: '255.255.0.0' },
  // 0.0.0.0/8
  { cidr: '0.0.0.0', mask: '255.0.0.0' },
  // 100.64.0.0/10 (CGNAT)
  { cidr: '100.64.0.0', mask: '255.192.0.0' },
  // 198.51.100.0/24 (documentation)
  { cidr: '198.51.100.0', mask: '255.255.255.0' },
  // 203.0.113.0/24 (documentation)
  { cidr: '203.0.113.0', mask: '255.255.255.0' },
];

// ------------------------------------------------------------------
// Allowlist de hosts internos legítimos (infra Crux)
// ------------------------------------------------------------------

const ALLOWED_INTERNAL_HOSTS = new Set([
  'dovecot.crux.internal',
  'postfix.crux.internal',
  'amavis.crux.internal',
  'minio.crux.internal',
  'redis.crux.internal',
  'postgres.crux.internal',
  'api.crux.internal',
  'api.crux.local',
  'localhost',
]);

// ------------------------------------------------------------------
// IP validation helpers
// ------------------------------------------------------------------

function ipToInteger(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const num = parts.reduce((acc, part) => {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return NaN;
    return (acc << 8) | n;
  }, 0);
  return isNaN(num) ? null : num;
}

function matchesPrivateRange(ip: string): boolean {
  const ipInt = ipToInteger(ip);
  if (ipInt === null) return false;

  for (const range of PRIVATE_RANGES) {
    const rangeInt = ipToInteger(range.cidr);
    const maskInt = ipToInteger(range.mask);
    if (rangeInt === null || maskInt === null) continue;
    if ((ipInt & maskInt) === (rangeInt & maskInt)) {
      return true;
    }
  }

  // IPv6 private ranges
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('::1') || lower.startsWith('fc00:') || lower.startsWith('fd00:') ||
        lower.startsWith('fe80:') || lower.startsWith('::ffff:')) {
      return true;
    }
  }

  return false;
}

// ------------------------------------------------------------------
// SSRF Validation
// ------------------------------------------------------------------

export interface SsrfValidationResult {
  safe: boolean;
  reason?: string;
  resolvedIp?: string;
}

/**
 * Validates a hostname or URL against SSRF attacks.
 * Resolves DNS and checks for IP spoofing, private ranges, etc.
 */
export async function validateAgainstSsrf(
  urlOrHost: string,
  options: { allowInternal?: boolean } = {}
): Promise<SsrfValidationResult> {
  const { allowInternal = false } = options;

  let hostname: string;

  try {
    if (urlOrHost.includes('://')) {
      const url = new URL(urlOrHost);
      hostname = url.hostname;
    } else {
      hostname = urlOrHost;
    }
  } catch {
    return { safe: false, reason: 'Invalid URL or hostname' };
  }

  // Check against allowed internal hosts
  if (allowInternal && ALLOWED_INTERNAL_HOSTS.has(hostname)) {
    return { safe: true };
  }

  // DNS resolution
  let resolvedIps: string[];
  try {
    const result = await dnsLookup(hostname, { all: true });
    resolvedIps = result.map((r) => r.address);
  } catch {
    return { safe: false, reason: 'DNS resolution failed' };
  }

  // Check each resolved IP
  for (const ip of resolvedIps) {
    if (matchesPrivateRange(ip)) {
      return {
        safe: false,
        reason: `Resolved IP ${ip} is in private/reserved range`,
        resolvedIp: ip,
      };
    }
  }

  return { safe: true, resolvedIp: resolvedIps[0] };
}

// ------------------------------------------------------------------
// URL sanitization — strip dangerous schemes and params
// ------------------------------------------------------------------

export function sanitizeUrl(url: string, allowedSchemes?: string[]): string {
  if (!url) return '';

  const allowed = allowedSchemes || ['http', 'https', 'mailto', 'tel'];

  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.replace(':', '').toLowerCase();

    if (!allowed.includes(scheme)) {
      return '';
    }

    // Strip query params that could contain injections
    const safeSearchParams = new URLSearchParams();
    for (const [key, value] of parsed.searchParams) {
      // Allow only alphanumeric param names/values
      if (/^[a-zA-Z0-9_-]+$/.test(key) && /^[a-zA-Z0-9_\- %.]+$/.test(value)) {
        safeSearchParams.append(key, value);
      }
    }

    parsed.search = safeSearchParams.toString();
    return parsed.toString();
  } catch {
    return '';
  }
}

// ------------------------------------------------------------------
// Attachment size & type validation
// ------------------------------------------------------------------

const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50MB

const SAFE_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/csv', 'text/calendar',
  'application/rtf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-tar',
  'application/gzip',
  'application/x-7z-compressed',
]);

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.ps1', '.vbs', '.js', '.html', '.htm',
  '.hta', '.msi', '.scr', '.pif', '.inf', '.reg', '.com',
  '.sh', '.csh', '.ksh', '.bash', '.zsh',
  '.php', '.asp', '.aspx', '.jsp', '.cgi', '.pl', '.py',
  '.jar', '.class', '.dll', '.so', '.dylib',
  '.docm', '.xlsm', '.pptm',
  '.apk', '.ipa', '.app',
  '.cpl', '.msc', '.mscx',
  '.vbscript', '.wsf', '.wsh', '.sct',
  '.reg', '.scf', '.msh', '.msh1', '.msh2',
]);

/**
 * Validates attachment MIME type and filename against allowlist
 */
export function validateAttachment(
  mimeType: string,
  filename: string,
  size: number
): { valid: boolean; reason?: string } {
  // Size check
  if (size > MAX_ATTACHMENT_SIZE) {
    return { valid: false, reason: `Attachment exceeds ${MAX_ATTACHMENT_SIZE / 1024 / 1024}MB limit` };
  }

  // Empty file
  if (size === 0) {
    return { valid: false, reason: 'Empty file' };
  }

  // MIME type check
  const mime = mimeType.toLowerCase().trim();
  const isImageSubtype = mime.startsWith('image/');
  const isSafeType = SAFE_MIME_TYPES.has(mime);

  if (!isSafeType && !isImageSubtype) {
    return { valid: false, reason: 'MIME type not allowed' };
  }

  // Dangerous extension check
  const lowerName = filename.toLowerCase();
  for (const ext of DANGEROUS_EXTENSIONS) {
    if (lowerName.endsWith(ext)) {
      return { valid: false, reason: `File extension ${ext} is blocked` };
    }
  }

  // Double extension check (e.g. file.txt.exe)
  const dotCount = (lowerName.match(/\./g) || []).length;
  if (dotCount >= 3) {
    return { valid: false, reason: 'Suspicious multiple file extensions' };
  }

  // Path traversal check
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { valid: false, reason: 'Filename contains path traversal characters' };
  }

  return { valid: true };
}

export { PRIVATE_RANGES, ALLOWED_INTERNAL_HOSTS, SAFE_MIME_TYPES, DANGEROUS_EXTENSIONS };