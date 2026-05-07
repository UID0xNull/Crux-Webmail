// ============================================================================
// Crux-Webmail — Unit Tests: Input Sanitizer
// ============================================================================

import {
  stripHtml,
  sanitizePlainText,
  sanitizeEmailBody,
  sanitizeEmailHtml,
  validateFilename,
  detectXssPayload,
  detectSqliPayload,
  detectCommandInjection,
} from '../../../src/server/utils/input-sanitizer';

describe('Input Sanitizer', () => {
  describe('stripHtml', () => {
    it('should remove all HTML tags', () => {
      expect(stripHtml('<b>Bold</b> <i>Italic</i>')).toBe('Bold Italic');
    });

    it('should handle empty/null input', () => {
      expect(stripHtml('')).toBe('');
      expect(stripHtml(null as any)).toBe('');
      expect(stripHtml(undefined as any)).toBe('');
    });

    it('should remove nested tags', () => {
      expect(stripHtml('<div><p>Hello</p></div>')).toBe('Hello');
    });

    it('should preserve plain text', () => {
      expect(stripHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('sanitizePlainText', () => {
    it('should strip HTML by default', () => {
      expect(sanitizePlainText('<b>hello</b>')).toBe('hello');
    });

    it('should allow HTML when configured', () => {
      expect(sanitizePlainText('<b>hello</b>', { allowHtml: true })).toBe('<b>hello</b>');
    });

    it('should strip null bytes', () => {
      expect(sanitizePlainText('hello\x00world')).toBe('helloworld');
    });

    it('should respect maxLength', () => {
      const long = 'a'.repeat(200);
      expect(sanitizePlainText(long, { maxLength: 50 })).toHaveLength(50);
    });

    it('should trim whitespace', () => {
      expect(sanitizePlainText('  hello  ')).toBe('hello');
    });
  });

  describe('sanitizeEmailBody', () => {
    it('should strip null bytes and control chars', () => {
      expect(sanitizeEmailBody('hello\x00\x01world'))
        .not.toContain('\0');
    });

    it('should handle empty input', () => {
      expect(sanitizeEmailBody('')).toBe('');
    });

    it('should preserve normal text', () => {
      expect(sanitizeEmailBody('Hello world! This is an email.'))
        .toBe('Hello world! This is an email.');
    });
  });

  describe('sanitizeEmailHtml', () => {
    it('should strip script tags', () => {
      const result = sanitizeEmailHtml('<script>alert(1)</script><p>Safe</p>');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert(1)');
    });

    it('should strip event handlers', () => {
      const result = sanitizeEmailHtml('<img src="x" onclick="alert(1)">');
      expect(result).not.toContain('onclick');
    });

    it('should strip javascript: protocol', () => {
      const result = sanitizeEmailHtml('<a href="javascript:alert(1)">Click</a>');
      expect(result).not.toContain('javascript');
    });

    it('should strip iframe/embed/object tags', () => {
      ['<iframe src="x"></iframe>', '<embed src="x">', '<object data="x"></object>'].forEach((tag) => {
        const result = sanitizeEmailHtml(tag);
        expect(result).not.toContain('iframe');
        expect(result).not.toContain('embed');
        expect(result).not.toContain('object');
      });
    });

    it('should strip vbscript: protocol', () => {
      const result = sanitizeEmailHtml('<a href="vbscript:msgbox(1)">evil</a>');
      expect(result).not.toContain('vbscript');
    });
  });

  describe('validateFilename', () => {
    it('should accept valid filenames', () => {
      const result = validateFilename('document.pdf');
      expect(result.valid).toBe(true);
      expect(result.sanitizedFilename).toBe('document.pdf');
    });

    it('should reject empty filenames', () => {
      const result = validateFilename('');
      expect(result.valid).toBe(false);
    });

    it('should reject overly long filenames', () => {
      const result = validateFilename('a'.repeat(256));
      expect(result.valid).toBe(false);
    });

    it('should normalize path separators', () => {
      const result = validateFilename('folder\\file.txt');
      expect(result.valid).toBe(true);
      expect(result.sanitizedFilename).toBe('folder_file.txt');
    });

    it('should strip leading dots', () => {
      const result = validateFilename('..hidden');
      expect(result.valid).toBe(true);
      expect(result.sanitizedFilename?.startsWith('.')).toBe(false);
    });
  });

  describe('detectXssPayload', () => {
    it('should detect script tags', () => {
      expect(detectXssPayload('<script>alert(1)</script>')).toBe(true);
    });

    it('should detect javascript: URIs', () => {
      expect(detectXssPayload('javascript:alert(1)')).toBe(true);
    });

    it('should detect onerror handlers', () => {
      expect(detectXssPayload('<img onerror=alert(1)>')).toBe(true);
    });

    it('should detect iframe tags', () => {
      expect(detectXssPayload('<iframe src="evil.com"></iframe>')).toBe(true);
    });

    it('should return false for safe input', () => {
      expect(detectXssPayload('Hello world, no scripts here!')).toBe(false);
    });

    it('should return false for text without angle brackets', () => {
      expect(detectXssPayload('plain text with no tags')).toBe(false);
    });
  });

  describe('detectSqliPayload', () => {
    it('should detect basic SQL injection', () => {
      expect(detectSqliPayload("' OR 1=1; DROP TABLE users; --")).toBe(true);
    });

    it('should detect UNION-based injection', () => {
      expect(detectSqliPayload('UNION SELECT * FROM users')).toBe(true);
    });

    it('should detect comment-based injection', () => {
      expect(detectSqliPayload("admin' --")).toBe(true);
    });

    it('should return false for safe input', () => {
      expect(detectSqliPayload('Hello, my name is John')).toBe(false);
    });

    it('should return false for empty input', () => {
      expect(detectSqliPayload('')).toBe(false);
    });
  });

  describe('detectCommandInjection', () => {
    it('should detect semicolon-based injection', () => {
      expect(detectCommandInjection('name; rm -rf /')).toBe(true);
    });

    it('should detect pipe-based injection', () => {
      expect(detectCommandInjection('input | bash')).toBe(true);
    });

    it('should detect backtick execution', () => {
      expect(detectCommandInjection('name `whoami`')).toBe(true);
    });

    it('should detect dollar-paren execution', () => {
      expect(detectCommandInjection('input $(cat /etc/passwd)')).toBe(true);
    });

    it('should return false for safe input', () => {
      expect(detectCommandInjection('Hello World')).toBe(false);
    });
  });
});