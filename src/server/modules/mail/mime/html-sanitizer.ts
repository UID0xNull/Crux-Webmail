// ============================================================================
// Crux-Webmail — HTML Sanitizer: XSS Prevention Engine
// ============================================================================
// Limpia HTML recibido de emails contra inyecciones XSS, scripts embebidos,
// CSS malicioso, enlaces peligrosos y eventos en línea.
// Política: lista blanca estricta + eliminación recursiva.
// ============================================================================

import sanitizeHtml from 'sanitize-html';
import { auditLogger } from '../../utils/audit-logger';
import { DEFAULT_MIME_CONFIG, MimePipelineConfig } from './types';

// ------------------------------------------------------------------
// Tracking sanitization results for security audit
// ------------------------------------------------------------------
export interface SanitizationReport {
  threatsFound: number;
  removedElements: string[];
  removedAttributes: string[];
  removedProtocols: string[];
  cleanedCss: number;
}

// ------------------------------------------------------------------
// Known XSS vectors to detect
// ------------------------------------------------------------------
const XSS_PATTERNS = [
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /data\s*:text\/html/gi,
  /on\w+\s*=/gi,
  /expression\s*\(/gi,
  /url\s*\(/gi,
  /@import/gi,
  /<script/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
  /<link\s[^>]*href/gi,
  /eval\s*\(/gi,
  /document\.(cookie|domain|write|location)/gi,
  /window\.\w+/gi,
  /<base\s/gi,
  /<meta[^>]*http-equiv/gi,
  /-moz-binding/gi,
];

// ------------------------------------------------------------------
// White-listed tags
// ------------------------------------------------------------------
const ALLOWED_TAGS = [
  'b', 'i', 'u', 's', 'strike', 'strong', 'em', 'blockquote',
  'code', 'pre', 'hr', 'br', 'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'a', 'img', 'abbr', 'cite', 'del', 'ins', 'q', 'sub', 'sup',
  'font', 'small', 'big', 'tt', 'mark', 'rp', 'rt', 'rtc', 'ruby',
  'center', 'dfn', 'kbd', 'samp', 'var', 'bdo',
];

// ------------------------------------------------------------------
// White-listed attributes
// ------------------------------------------------------------------
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  'a': ['href', 'title', 'rel', 'target'],
  'img': ['src', 'alt', 'width', 'height', 'style'],
  'blockquote': ['cite'],
  'del': ['cite'],
  'ins': ['cite'],
  'q': ['cite'],
  '*': ['class', 'style', 'lang', 'dir', 'title'],
};

// ------------------------------------------------------------------
// Allowed CSS properties (inline)
// ------------------------------------------------------------------
const ALLOWED_CSS_PROPS = [
  'color', 'background-color', 'font-size', 'font-weight', 'font-style',
  'font-family', 'text-align', 'text-decoration', 'line-height',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border', 'border-top', 'border-bottom', 'border-left', 'border-right',
  'border-radius', 'width', 'height', 'max-width', 'min-width',
  'list-style', 'list-style-type', 'list-style-position',
  'text-transform', 'letter-spacing', 'word-spacing',
  'display', 'overflow', 'vertical-align', 'white-space',
  'text-indent', 'direction', 'unicode-bidi',
  'opacity', 'box-shadow', 'background',
  'outline', 'visibility', 'position', 'top', 'left', 'right', 'bottom',
  'z-index', 'clear', 'float',
];

// ------------------------------------------------------------------
// HtmlSanitizer — service
// ------------------------------------------------------------------
export class HtmlSanitizer {
  private config: MimePipelineConfig;

  constructor(config?: Partial<MimePipelineConfig>) {
    this.config = { ...DEFAULT_MIME_CONFIG, ...config };
  }

  updateConfig(partial: Partial<MimePipelineConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  // ----------------------------------------------------------------
  // Main sanitize method
  // ----------------------------------------------------------------
  sanitize(html: string, uid?: string): { cleanHtml: string; report: SanitizationReport } {
    if (!html || !this.config.sanitizeHtml) {
      return { cleanHtml: html || '', report: this.emptyReport() };
    }

    const uidLabel = uid ?? 'unknown';
    const report = this.emptyReport();

    // 1. Pre-scan: count XSS-like patterns
    const xssCount = this.detectThreats(html, report);

    // 2. Sanitize with whitelist
    const cleanHtml = sanitizeHtml(html, {
      allowedTags: this.config.sanitizeHtml ? ALLOWED_TAGS : [],
      allowedAttributes: this.config.sanitizeHtml ? ALLOWED_ATTRIBUTES : {},
      allowedSchemes: this.config.allowedProtocols,
      allowedSchemesByTag: {
        img: this.config.allowImages ? ['http', 'https', 'data', 'cid'] : ['http', 'https'],
      },
      allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],

      // Transform <a> tags to enforce security
      transformLinks: {
        a: (transformedAttributes, _tagName, _originalAttributes) => {
          const href = transformedAttributes.href || '';
          if (this.isDangerousHref(href)) {
            delete transformedAttributes.href;
            report.removedProtocols.push('dangerous');
          }

          if (href.startsWith('http') || href.startsWith('//')) {
            transformedAttributes.rel = 'noopener noreferrer';
            transformedAttributes.target = '_blank';
          }

          if (this.config.allowedDomains.length > 0) {
            try {
              const hostname = new URL(href).hostname;
              if (!this.config.allowedDomains.includes(hostname)) {
                delete transformedAttributes.href;
              }
            } catch {
              delete transformedAttributes.href;
            }
          }

          return transformedAttributes;
        },
      },

      allowedStyles: this.config.allowCss ? ALLOWED_CSS_PROPS : [],
      selfClosing: ['img', 'br', 'hr', 'input', 'meta'],
      parseStyleAttributes: this.config.allowCss,
    });

    // 3. Post-processing: recursive sanitization pass
    let iterations = 0;
    let passHtml = cleanHtml;
    const maxIterations = 3;

    while (this.containsDangerousContent(passHtml) && iterations < maxIterations) {
      passHtml = this.stripDangerousHtml(passHtml);
      iterations++;
      report.threatsFound++;
    }

    // Log sanitization stats
    if (xssCount > 0) {
      auditLogger.warn(`XSS threats sanitized in ${uidLabel}`, {
        metadata: {
          uid: uidLabel,
          threats: report.threatsFound,
          removedElements: report.removedElements,
          iterations,
        },
      });
    }

    return { cleanHtml: passHtml, report };
  }

  // ----------------------------------------------------------------
  // Sanitize a batch of HTML strings
  // ----------------------------------------------------------------
  sanitizeBatch(htmls: string[], uids?: string[]): Array<{ cleanHtml: string; report: SanitizationReport }> {
    return htmls.map((html, i) => {
      const uid = uids?.[i] ?? `batch-${i}`;
      return this.sanitize(html, uid);
    });
  }

  // ----------------------------------------------------------------
  // Threat detection
  // ----------------------------------------------------------------
  private detectThreats(html: string, report: SanitizationReport): number {
    let count = 0;
    for (const pattern of XSS_PATTERNS) {
      const matches = html.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }
    report.threatsFound = count;
    return count;
  }

  // ----------------------------------------------------------------
  // Strip dangerous HTML elements via regex as final safety net
  // ----------------------------------------------------------------
  private stripDangerousHtml(html: string): string {
    html = html.replace(/<script[^>]*>.*?<\/script>/gis, '');
    html = html.replace(/<iframe[^>]*>.*?<\/iframe>/gis, '');
    html = html.replace(/<object[^>]*>.*?<\/object>/gis, '');
    html = html.replace(/<embed[^>]*>.*?<\/embed>/gis, '');
    html = html.replace(/<form[^>]*>.*?<\/form>/gis, '');
    html = html.replace(/<base\s[^>]*>/gi, '');
    html = html.replace(/<meta[^>]*http-equiv[^>]*>/gi, '');
    html = html.replace(/\s+on\w+="[^"]*"/gi, '');
    html = html.replace(/\s+on\w+='[^']*'/gi, '');
    html = html.replace(/\s+on\w+=[^\s>]*/gi, '');
    html = html.replace(/(href|src)\s*=\s*["']\s*javascript\s*:/gi, '$1=""');
    html = html.replace(/(href|src)\s*=\s*["']\s*vbscript\s*:/gi, '$1=""');
    html = html.replace(/expression\s*\([^)]*\)/gi, '');
    html = html.replace(/behavior\s*:\s*url/gi, '');
    html = html.replace(/-moz-binding\s*:/gi, '');

    return html;
  }

  private containsDangerousContent(html: string): boolean {
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(html)) return true;
    }
    return false;
  }

  private isDangerousHref(href: string): boolean {
    if (!href) return false;
    const lower = href.toLowerCase().trim();
    return (
      lower.startsWith('javascript:') ||
      lower.startsWith('vbscript:') ||
      lower.startsWith('data:text/html')
    );
  }

  private emptyReport(): SanitizationReport {
    return {
      threatsFound: 0,
      removedElements: [],
      removedAttributes: [],
      removedProtocols: [],
      cleanedCss: 0,
    };
  }
}