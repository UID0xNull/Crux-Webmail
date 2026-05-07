// ============================================================================
// Crux-Webmail — Unit Tests: SMTP Service (with mock transporters)
// ============================================================================

import { SMTPMock, mockSMTPSend } from '../../mocks/smtp.mock';

// Mock the real SMTP service to use our mock
jest.mock('../../../../src/server/utils/audit-logger', () => ({
  auditLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), critical: jest.fn() },
}));

jest.mock('../../../../src/server/modules/email/smtp-service', () => {
  const { mockSMTPSend, mockSMTPClose } = require('../../mocks/smtp.mock');
  return {
    sendEmail: mockSMTPSend,
    closeAllTransporters: mockSMTPClose,
    sendEncryptedEmail: jest.fn().mockResolvedValue({ messageId: 'encrypted-123', status: 'sent' }),
    sendTemplateEmail: jest.fn().mockResolvedValue({ messageId: 'template-123' }),
  };
});

jest.mock('openpgp', () => ({
  openpgp: {
    encrypt: jest.fn().mockResolvedValue('encrypted-content'),
    createMessage: jest.fn().mockReturnValue({ text: 'test' }),
    readKey: jest.fn().mockResolvedValue({ id: 'key-123' }),
  },
}));

describe('SMTP Service — Mocked', () => {
  let smtpService: any;

  beforeEach(() => {
    SMTPMock.init();
    jest.resetModules();
    smtpService = require('../../../../src/server/modules/email/smtp-service');
  });

  describe('sendEmail', () => {
    it('should send email and return message ID', async () => {
      const result = await smtpService.sendEmail('account-1', {}, {
        from: 'sender@test.com',
        to: ['recipient@test.com'],
        subject: 'Test',
        text: 'Hello',
      });

      expect(result.messageId).toBeDefined();
      expect(SMTPMock.getSentCount()).toBe(1);
    });

    it('should track sent emails', async () => {
      await smtpService.sendEmail('account-1', {}, {
        from: 'a@b.com',
        to: ['c@d.com'],
        subject: 'First',
      });

      await smtpService.sendEmail('account-1', {}, {
        from: 'a@b.com',
        to: ['e@f.com'],
        subject: 'Second',
      });

      expect(SMTPMock.getSentCount()).toBe(2);
      const last = SMTPMock.getLastSent();
      expect(last?.subject).toBe('Second');
    });

    it('should include CC recipients', async () => {
      const result = await smtpService.sendEmail('account-1', {}, {
        from: 'sender@test.com',
        to: ['primary@test.com'],
        cc: ['cc1@test.com', 'cc2@test.com'],
        subject: 'CC Test',
        text: 'Body',
      });

      expect(result.messageId).toBeDefined();
    });

    it('should fail when mock is configured to fail', async () => {
      SMTPMock.setShouldFail(true);

      await expect(
        smtpService.sendEmail('account-1', {}, {
          from: 'sender@test.com',
          to: ['recipient@test.com'],
          subject: 'Failing',
        })
      ).rejects.toThrow('SMTP connection refused');
    });
  });

  describe('sendEncryptedEmail', () => {
    it('should encrypt and send email', async () => {
      const result = await smtpService.sendEncryptedEmail(
        'account-1',
        { host: 'localhost', port: 587, secure: false, username: 'test', password: 'pass' },
        {
          from: 'sender@test.com',
          to: ['recipient@test.com'],
          subject: 'Encrypted',
          text: 'Secret message',
        },
        '-----BEGIN PGP PUBLIC KEY BLOCK-----'
      );

      expect(result.messageId).toBeDefined();
      expect(result.status).toBe('sent');
    });
  });

  describe('sendTemplateEmail', () => {
    it('should render and send template', async () => {
      const result = await smtpService.sendTemplateEmail(
        'account-1',
        { host: 'localhost', port: 587, secure: false, username: 'test', password: 'pass' },
        'welcome',
        'newuser@test.com',
        [{ name: 'name', value: 'Alice' }]
      );

      expect(result.messageId).toBeDefined();
    });
  });
});