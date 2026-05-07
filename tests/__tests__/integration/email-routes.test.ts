// ============================================================================
// Crux-Webmail — Integration Tests: Email Routes (Fastify)
// ============================================================================

import { ModelMock } from '../../mocks/sequelize.mock';
import { IMAPMock } from '../../mocks/imap.mock';
import { SMTPMock } from '../../mocks/smtp.mock';
import { BullMQMock } from '../../mocks/bullmq.mock';

jest.mock('../../../../src/server/models/User', () => ({
  UserModel: class extends ModelMock {
    static name = 'User';
  },
}));

jest.mock('../../../../src/server/modules/email/imap-service', () => {
  const { mockIMAPConnect, mockIMAPDisconnect, mockIMAPListFolders, mockIMAPFetchByUID, mockIMAPSearch, mockIMAPMarkFlag, mockIMAPDelete, mockIMAPMove } = require('../../mocks/imap.mock');
  return {
    connectIMAP: mockIMAPConnect,
    disconnectIMAP: mockIMAPDisconnect,
    listFolders: mockIMAPListFolders,
    fetchEmailByUID: mockIMAPFetchByUID,
    searchEmailsWithPagination: mockIMAPSearch,
    markEmailFlag: mockIMAPMarkFlag,
    deleteEmail: mockIMAPDelete,
    moveEmail: mockIMAPMove,
    getIMAPStatus: jest.fn(() => IMAPMock.getStatus()),
  };
});

jest.mock('../../../../src/server/modules/email/smtp-service', () => {
  const { mockSMTPSend, mockSMTPClose } = require('../../mocks/smtp.mock');
  return {
    sendEmail: mockSMTPSend,
    closeSMTP: mockSMTPClose,
  };
});

jest.mock('../../../../src/server/modules/email/email-queue', () => {
  const { mockAddJob, mockGetQueueStats } = require('../../mocks/bullmq.mock');
  return {
    addEmailSendJob: jest.fn(async (userId: string, cfg: any, opts: any) => mockAddJob('email-send', 'send', { userId, cfg, opts })),
    addImapSyncJob: jest.fn(async (userId: string) => mockAddJob('imap-sync', 'sync', { userId })),
    getQueueStats: mockGetQueueStats,
  };
});

describe('Email Routes — Business Logic Layer', () => {
  let emailController: any;
  let UserModel: any;

  beforeEach(async () => {
    ModelMock.resetAll();
    IMAPMock.init();
    SMTPMock.init();
    BullMQMock.init();

    jest.resetModules();
    UserModel = (require('../../../../src/server/models/User') as any).UserModel;
    emailController = require('../../../../src/server/modules/email/email-controller');

    await UserModel.create({
      id: 'user-1',
      username: 'test@test.com',
      passwordHash: 'hashed-pw',
      is_active: true,
      roles: ['user'],
    });
  });

  describe('listUserFolders', () => {
    it('should list IMAP folders after connecting', async () => {
      IMAPMock.setConnected(true);
      const folders = await emailController.listUserFolders('user-1');
      expect(folders).toBeDefined();
      expect(Array.isArray(folders)).toBe(true);
    });

    it('should throw when user does not exist', async () => {
      await expect(emailController.listUserFolders('ghost-user')).rejects.toThrow('USER_NOT_FOUND');
    });

    it('should throw when user is inactive', async () => {
      await UserModel.update({ is_active: false }, { where: { id: 'user-1' } });
      await expect(emailController.listUserFolders('user-1')).rejects.toThrow('ACCOUNT_DISABLED');
    });
  });

  describe('searchEmails', () => {
    it('should return paginated emails', async () => {
      IMAPMock.setConnected(true);
      IMAPMock.addMessage({
        uid: 1,
        subject: 'Test Email',
        from: 'sender@example.com',
        to: 'test@test.com',
        date: new Date().toISOString(),
        flags: ['Seen'],
        hasAttachments: false,
        text: 'Hello world',
      });

      const result = await emailController.searchEmails('user-1', { folder: 'INBOX' });
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  describe('getEmailByUID', () => {
    it('should fetch a specific email', async () => {
      IMAPMock.setConnected(true);
      const msg = {
        uid: 42,
        subject: 'Important',
        from: 'boss@corp.com',
        to: 'test@test.com',
        date: new Date().toISOString(),
        flags: [],
        hasAttachments: true,
        text: 'Action required.',
        html: '<p>Action required.</p>',
      };
      IMAPMock.addMessage(msg);

      const email = await emailController.getEmailByUID('user-1', 'INBOX', 42);
      expect(email.uid).toBe(42);
      expect(email.subject).toBe('Important');
    });

    it('should throw when email not found', async () => {
      IMAPMock.setConnected(true);
      await expect(
        emailController.getEmailByUID('user-1', 'INBOX', 999)
      ).rejects.toThrow('MESSAGE_NOT_FOUND');
    });
  });

  describe('toggleEmailFlag', () => {
    it('should mark email as read', async () => {
      IMAPMock.setConnected(true);
      IMAPMock.addMessage({
        uid: 10,
        subject: 'Unread',
        from: 'a@b.com',
        to: 'test@test.com',
        date: new Date().toISOString(),
        flags: [],
        hasAttachments: false,
      });

      const result = await emailController.toggleEmailFlag('user-1', {
        uid: 10,
        folder: 'INBOX',
        flag: 'SEEN',
      });

      expect(result.status).toBe('updated');
      expect(result.uid).toBe(10);
    });
  });

  describe('queueEmailSend', () => {
    it('should queue an email for sending', async () => {
      const result = await emailController.queueEmailSend('user-1', {
        to: 'recipient@example.com',
        subject: 'Hello',
        text: 'Body',
      });

      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('queued');
    });

    it('should include CC/BCC', async () => {
      const result = await emailController.queueEmailSend('user-1', {
        to: 'primary@example.com',
        cc: 'cc@example.com',
        bcc: 'bcc@example.com',
        subject: 'Meeting',
        text: 'Agenda attached',
      });

      expect(result.status).toBe('queued');
    });
  });

  describe('triggerSync', () => {
    it('should trigger IMAP sync', async () => {
      const result = await emailController.triggerSync('user-1');
      expect(result.jobId).toBeDefined();
      expect(result.status).toBe('syncing');
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status', async () => {
      IMAPMock.setConnected(true);
      const status = await emailController.getSyncStatus('user-1');
      expect(status.status).toBe('connected');
      expect(status.imapStatus).toBe('connected');
    });
  });

  describe('bulkMarkFlags', () => {
    it('should process multiple UIDs', async () => {
      IMAPMock.setConnected(true);
      IMAPMock.addMessage({ uid: 1, subject: 'A', from: 'a@b.com', to: 't@t.com', date: '', flags: [], hasAttachments: false });
      IMAPMock.addMessage({ uid: 2, subject: 'B', from: 'a@b.com', to: 't@t.com', date: '', flags: [], hasAttachments: false });

      const result = await emailController.bulkMarkFlags('user-1', {
        folder: 'INBOX',
        uids: [1, 2],
        flag: 'SEEN',
      });

      expect(result.processed).toBeGreaterThanOrEqual(0);
    });
  });
});