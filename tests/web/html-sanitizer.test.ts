// ============================================================================
// Crux-Webmail — Unit Tests: Frontend HTML Sanitizer
// ============================================================================

import {
  sanitizeHtml,
  sanitizeEmail,
  sanitizeDisplayName,
  isSafeAttachment,
} from 'src/web/lib/sanitizer/html-sanitizer';

// ------------------------------------------------------------------
// Tests for sanitizeHtml
// ------------------------------------------------------------------
describe('html-sanitizer: sanitizeHtml', () => {
  it('should strip script tags', () => {
    const result = sanitizeHtml('<script>alert(1)</script><p>Safe</p>');
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert(1)');
  });

  it('should strip javascript: URIs', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">Click</a>');
    expect(result).not.toContain('javascript');
  });

  it('should strip event handlers', () => {
    const result = sanitizeHtml('<img src="x" onclick="alert(1)">');
    expect(result).not.toContain('onclick');
  });

  it('should strip iframe/embed/object tags', () => {
    ['<iframe src="x"></iframe>', '<embed src="x">', '<object data="x"></object>'].forEach(
      (tag) => {
        const result = sanitizeHtml(tag);
        expect(result).not.toContain('iframe');
        expect(result).not.toContain('embed');
        expect(result).not.toContain('object');
      }
    );
  });

  it('should handle empty/null input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null as unknown as string)).toBe('');
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
  });

  it('should preserve safe HTML content', () => {
    const safe = '<div><p><b>Bold</b> and <a href="https://example.com">link</a></p></div>';
    const result = sanitizeHtml(safe);
    expect(result).toContain('Bold');
    expect(result).toContain('https://example.com');
  });

  it('should strip vbscript: URIs', () => {
    const result = sanitizeHtml('<a href="vbscript:msgbox(1)">evil</a>');
    expect(result).not.toContain('vbscript');
  });

  it('should strip expressions() in CSS', () => {
    const result = sanitizeHtml('<div style="width: expression(alert(1))">test</div>');
    expect(result).not.toContain('expression(');
  });

  it('should allow tables when allowTables is true', () => {
    const html = '<table><tr><td>Data</td></tr></table>';
    const result = sanitizeHtml(html, { allowTables: true });
    expect(result).toContain('table');
  });

  it('should use strict mode when configured', () => {
    const html = '<table><div style="all:evil"><b>Bold</b><a href="https://ok.com">link</a></div></table>';
    const result = sanitizeHtml(html, { strict: true });
    expect(result).toContain('Bold');
    expect(result).not.toContain('table');
  });

  it('should strip @import CSS rules', () => {
    const result = sanitizeHtml('<div style="@import url(evil.css)">test</div>');
    expect(result).not.toContain('@import');
  });

  it('should strip -moz-binding CSS property', () => {
    const result = sanitizeHtml('<div style="-moz-binding: url(evil.xml)">test</div>');
    expect(result).not.toContain('-moz-binding');
  });
});

// ------------------------------------------------------------------
// Tests for sanitizeEmail
// ------------------------------------------------------------------
describe('html-sanitizer: sanitizeEmail', () => {
  it('should lowercase and trim email', () => {
    expect(sanitizeEmail('  Test@Example.COM  ')).toBe('test@example.com');
  });

  it('should strip invalid characters', () => {
    expect(sanitizeEmail('user<script>@example.com')).toBe('user@example.com');
  });

  it('should return empty for invalid input', () => {
    expect(sanitizeEmail('')).toBe('');
    expect(sanitizeEmail(null as unknown as string)).toBe('');
    expect(sanitizeEmail(undefined as unknown as string)).toBe('');
  });

  it('should preserve valid special characters', () => {
    expect(sanitizeEmail('user+tag@sub.example.com')).toBe('user+tag@sub.example.com');
  });

  it('should handle unicode domain gracefully', () => {
    expect(sanitizeEmail('user@münchen.de')).toBe('user@.de'); // strips non-ASCII
  });
});

// ------------------------------------------------------------------
// Tests for sanitizeDisplayName
// ------------------------------------------------------------------
describe('html-sanitizer: sanitizeDisplayName', () => {
  it('should truncate long names to 255 chars', () => {
    const longName = 'a'.repeat(300);
    expect(sanitizeDisplayName(longName).length).toBe(255);
  });

  it('should strip dangerous characters', () => {
    expect(sanitizeDisplayName('John<script>Doe</script>')).toBe('JohnDoe');
  });

  it('should handle empty input', () => {
    expect(sanitizeDisplayName('')).toBe('');
  });

  it('should preserve unicode names', () => {
    expect(sanitizeDisplayName('José García')).toBe('José García');
    expect(sanitizeDisplayName('Müller')).toBe('Müller');
  });

  it('should strip HTML entities like &', () => {
    expect(sanitizeDisplayName('John & Jane')).toBe('John  Jane');
  });
});

// ------------------------------------------------------------------
// Tests for isSafeAttachment
// ------------------------------------------------------------------
describe('html-sanitizer: isSafeAttachment', () => {
  it('should allow safe image types', () => {
    expect(isSafeAttachment('image/png', 'photo.png')).toBe(true);
    expect(isSafeAttachment('image/jpeg', 'photo.jpg')).toBe(true);
    expect(isSafeAttachment('image/gif', 'anim.gif')).toBe(true);
    expect(isSafeAttachment('image/webp', 'pic.webp')).toBe(true);
  });

  it('should allow PDF', () => {
    expect(isSafeAttachment('application/pdf', 'doc.pdf')).toBe(true);
  });

  it('should allow safe document types', () => {
    expect(isSafeAttachment('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc.docx')).toBe(true);
  });

  it('should allow safe text types', () => {
    expect(isSafeAttachment('text/plain', 'file.txt')).toBe(true);
    expect(isSafeAttachment('text/csv', 'data.csv')).toBe(true);
  });

  it('should allow zip/gzip', () => {
    expect(isSafeAttachment('application/zip', 'archive.zip')).toBe(true);
    expect(isSafeAttachment('application/gzip', 'data.gz')).toBe(true);
  });

  it('should reject .exe files', () => {
    expect(isSafeAttachment('application/octet-stream', 'virus.exe')).toBe(false);
  });

  it('should reject .bat files', () => {
    expect(isSafeAttachment('application/octet-stream', 'malware.bat')).toBe(false);
  });

  it('should reject .ps1 files', () => {
    expect(isSafeAttachment('text/plain', 'script.ps1')).toBe(false);
  });

  it('should reject .js files even with correct mime', () => {
    expect(isSafeAttachment('application/javascript', 'evil.js')).toBe(false);
  });

  it('should reject .html files', () => {
    expect(isSafeAttachment('text/html', 'page.html')).toBe(false);
    expect(isSafeAttachment('text/html', 'page.htm')).toBe(false);
  });

  it('should reject .dll files', () => {
    expect(isSafeAttachment('application/octet-stream', 'lib.dll')).toBe(false);
  });

  it('should reject .php files', () => {
    expect(isSafeAttachment('text/plain', 'shell.php')).toBe(false);
  });

  it('should reject unsafe MIME types with safe extensions', () => {
    expect(isSafeAttachment('application/octet-stream', 'fake.exe')).toBe(false);
  });

  it('should allow image/* subtypes not in whitelist', () => {
    expect(isSafeAttachment('image/bmp', 'photo.bmp')).toBe(true);
    expect(isSafeAttachment('image/tiff', 'scan.tiff')).toBe(true);
  });
});