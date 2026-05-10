// ============================================================================
// Crux-Webmail — MIME Pipeline Unit & Integration Tests
// ============================================================================
import { MimePipeline } from '../src/server/modules/mail/mime/mime-pipeline';
import { HtmlSanitizer } from '../src/server/modules/mail/mime/html-sanitizer';
import { AttachmentValidator } from '../src/server/modules/mail/mime/attachment-validator';
import { ParsedAttachment } from '../src/server/modules/mail/mime/types';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function buildRawEmail(
  headers: Record<string, string>,
  body: string,
  mimeType = 'text/plain; charset=utf-8',
): Buffer {
  const head = [
    `From: ${headers.from || 'sender@example.com'}`,
    `To: ${headers.to || 'recipient@example.com'}`,
    `Subject: ${headers.subject || 'Test'}`,
    `Date: ${headers.date || 'Mon, 1 Jan 2024 12:00:00 +0000'}`,
    `Message-ID: <${headers.messageId || 'test-001@example.com'}>`,
    'MIME-Version: 1.0',
    `Content-Type: ${mimeType}`,
    '',
    body,
  ].join('\r\n');
  return Buffer.from(head);
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------
describe('MIME Pipeline — Unit & Integration', () => {
  let pipeline: MimePipeline;

  beforeEach(() => {
    pipeline = new MimePipeline();
  });

  afterEach(() => {
    pipeline.destroy();
  });

  // --------------------------------------------------------------
  // RFC 5322 / 2045: Parse emails
  // --------------------------------------------------------------
  it('should parse a simple text/plain email', async () => {
    const raw = buildRawEmail(
      {
        from: 'sender@example.com',
        subject: 'Hello World',
        messageId: 'test-simple@example.com',
      },
      'This is a simple test email body.',
    );

    const result = await pipeline.process(raw, 'uid-simple');
    expect(result).toBeDefined();
    expect(result.messageId).toBe('test-simple@example.com');
    expect(result.subject).toBe('Hello World');
    expect(result.bodyText).toContain('simple test email');
    expect(result.security.overallRisk).toBe('low');
    expect(result.processingDurationMs).toBeGreaterThan(0);
  });

  it('should parse multipart/alternative (text + html)', async () => {
    const raw = Buffer.from(
      [
        'From: <sender@example.com>',
        'To: <recipient@example.com>',
        'Subject: Multipart Test',
        'Date: Mon, 1 Jan 2024 12:00:00 +0000',
        'Message-ID: <test-multipart@example.com>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="bnd123"',
        '',
        '--bnd123',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Plain text version.',
        '',
        '--bnd123',
        'Content-Type: text/html; charset=utf-8',
        '',
        '<p><b>HTML</b> version.</p>',
        '',
        '--bnd123--',
      ].join('\r\n'),
    );

    const result = await pipeline.process(raw, 'uid-multipart');
    expect(result.bodyText).toContain('Plain text version');
    expect(result.bodyHtml).toContain('HTML');
  });

  // --------------------------------------------------------------
  // XSS Filtration
  // --------------------------------------------------------------
  it('should sanitize javascript: URIs in HTML', async () => {
    const raw = buildRawEmail(
      {
        from: 'attacker@evil.com',
        subject: 'XSS Test',
        messageId: 'xss-001@example.com',
      },
      '<a href="javascript:alert(1)">Click me</a>',
      'text/html; charset=utf-8',
    );

    const result = await pipeline.process(raw, 'uid-xss');
    expect(result.bodyHtml).not.toContain('javascript:');
    expect(result.security.xssThreatsFound).toBeGreaterThan(0);
  });

  it('should remove script tags', async () => {
    const sanitizer = new HtmlSanitizer();
    const result = sanitizer.sanitize('<script>alert("xss")</script><p>Safe text</p>');
    expect(result.cleanHtml).not.toContain('<script>');
    expect(result.cleanHtml).toContain('Safe text');
    expect(result.report.threatsFound).toBeGreaterThan(0);
  });

  it('should strip onerror handlers from img tags', async () => {
    const sanitizer = new HtmlSanitizer();
    const result = sanitizer.sanitize('<img src="x" onerror="alert(1)">');
    expect(result.cleanHtml).not.toContain('onerror');
    expect(result.cleanHtml).not.toContain('alert');
  });

  it('should remove vbscript URIs', async () => {
    const sanitizer = new HtmlSanitizer();
    const result = sanitizer.sanitize('<a href="vbscript:msgbox(1)">evil</a>');
    expect(result.cleanHtml).not.toContain('vbscript:');
  });

  it('should preserve safe HTML content', async () => {
    const sanitizer = new HtmlSanitizer();
    const safeHtml =
      '<div><p><b>Bold text</b> and <a href="https://example.com">safe link</a></p><ul><li>Item 1</li><li>Item 2</li></ul></div>';
    const result = sanitizer.sanitize(safeHtml);
    expect(result.cleanHtml).toContain('Bold text');
    expect(result.cleanHtml).toContain('https://example.com');
    expect(result.cleanHtml).toContain('<li>Item 1</li>');
    expect(result.report.threatsFound).toBe(0);
  });

  it('should add noopener noreferrer to external links', async () => {
    const sanitizer = new HtmlSanitizer();
    const result = sanitizer.sanitize('<a href="https://external.com">Click</a>');
    expect(result.cleanHtml).toContain('noopener noreferrer');
  });

  // --------------------------------------------------------------
  // Attachment Validation
  // --------------------------------------------------------------
  it('should reject executables by extension', async () => {
    const validator = new AttachmentValidator();
    const attachment: ParsedAttachment = {
      filename: 'malware.exe',
      mimeType: 'application/octet-stream',
      size: 100,
      content: Buffer.from('fake exe content'),
      contentId: '',
      disposition: 'attachment',
      securityStatus: 'validating',
      virusScanStatus: 'pending',
      validatedAt: '',
    };

    const result = await validator.validateAttachment(attachment, 'uid-test');
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('blocked_extension');
  });

  it('should reject oversized attachments', async () => {
    const validator = new AttachmentValidator({
      maxAttachmentSize: 5 * 1024 * 1024, // 5MB
    });
    const bigAttachment: ParsedAttachment = {
      filename: 'big.zip',
      mimeType: 'application/zip',
      size: 10 * 1024 * 1024, // 10MB
      content: Buffer.alloc(1024), // content smaller than size
      contentId: '',
      disposition: 'attachment',
      securityStatus: 'validating',
      virusScanStatus: 'pending',
      validatedAt: '',
    };

    const result = await validator.validateAttachment(bigAttachment, 'uid-big');
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('exceeds_max_size');
  });

  it('should approve safe image attachments', async () => {
    const validator = new AttachmentValidator();
    const img: ParsedAttachment = {
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 250000,
      content: Buffer.alloc(100),
      contentId: '',
      disposition: 'attachment',
      securityStatus: 'validating',
      virusScanStatus: 'pending',
      validatedAt: '',
    };

    const result = await validator.validateAttachment(img, 'uid-img');
    expect(result.approved).toBe(true);
    expect(result.securityStatus).toBe('clean');
  });

  it('should approve PDF attachments', async () => {
    const validator = new AttachmentValidator();
    const pdf: ParsedAttachment = {
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      size: 500000,
      content: Buffer.alloc(100),
      contentId: '',
      disposition: 'attachment',
      securityStatus: 'validating',
      virusScanStatus: 'pending',
      validatedAt: '',
    };

    const result = await validator.validateAttachment(pdf, 'uid-pdf');
    expect(result.approved).toBe(true);
  });

  // --------------------------------------------------------------
  // ClamAV Scanner (disabled mode)
  // NOTE: ClamavScanner not yet implemented in this project
  // --------------------------------------------------------------
  // it('should return clean when ClamAV is disabled', async () => {
  //   const scanner = new ClamavScanner({ enabled: false });
  //   const result = await scanner.scan(Buffer.from('test'), 'test.txt', 'uid-scan');
  //   expect(result.clean).toBe(true);
  //   expect(result.scanDurationMs).toBe(0);
  // });
  // --------------------------------------------------------------
  // Pipeline batch processing
  // --------------------------------------------------------------
  it('should process batch of emails gracefully', async () => {
    const messages = [
      { buffer: buildRawEmail({ subject: 'Email 1' }, 'Body 1'), uid: 'uid-batch-1' },
      { buffer: buildRawEmail({ subject: 'Email 2' }, 'Body 2'), uid: 'uid-batch-2' },
      { buffer: buildRawEmail({ subject: 'Email 3' }, 'Body 3'), uid: 'uid-batch-3' },
    ];

    const results = await pipeline.processBatch(messages);
    expect(results.length).toBe(3);
    expect(results[0].subject).toBe('Email 1');
    expect(results[1].subject).toBe('Email 2');
    expect(results[2].subject).toBe('Email 3');
  });

  it('should handle errors in batch without stopping', async () => {
    const messages = [
      { buffer: buildRawEmail({ subject: 'OK' }, 'Good'), uid: 'uid-ok' },
      { buffer: Buffer.alloc(0), uid: 'uid-empty' }, // Will likely fail
      { buffer: buildRawEmail({ subject: 'Also OK' }, 'Also good'), uid: 'uid-also-ok' },
    ];

    const results = await pipeline.processBatch(messages);
    expect(results.length).toBeLessThanOrEqual(3);
    // At least the valid ones should come through
    const subjects = results.map((r) => r.subject);
    expect(subjects).toContain('OK');
    expect(subjects).toContain('Also OK');
  });

  // --------------------------------------------------------------
  // Config updates
  // --------------------------------------------------------------
  it('should update config and propagate to services', () => {
    pipeline.updateConfig({
      maxAttachmentSize: 10 * 1024 * 1024,
      sanitizeHtml: false,
    });
    expect(pipeline.getConfig().maxAttachmentSize).toBe(10 * 1024 * 1024);
    expect(pipeline.getConfig().sanitizeHtml).toBe(false);
  });

  // --------------------------------------------------------------
  // Memory & lifecycle
  // --------------------------------------------------------------
  it('should clean up on destroy', () => {
    const listenerCount = pipeline.listenerCount('mime:complete');
    pipeline.destroy();
    expect(pipeline.listenerCount('mime:complete')).toBe(0);
  });
});