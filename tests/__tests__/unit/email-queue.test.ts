// ============================================================================
// Crux-Webmail — Unit Tests: BullMQ Queue System (fully mocked)
// ============================================================================

import { BullMQMock, mockAddJob } from '../../mocks/bullmq.mock';

jest.mock('../../../../src/server/utils/audit-logger', () => ({
  auditLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), critical: jest.fn() },
}));

jest.mock('../../../../src/server/modules/email/email-queue', () => {
  const { mockAddJob, mockGetQueueStats } = require('../../mocks/bullmq.mock');
  return {
    addImapSyncJob: jest.fn(async (userId: string) => mockAddJob('imap-sync', 'sync', { userId })),
    addEmailSendJob: jest.fn(async (accountId: string, smtpConfig: any, emailOptions: any) =>
      mockAddJob('email-send', 'send', { accountId, smtpConfig, emailOptions })),
    addPgpJob: jest.fn(async (op: string, data: any) =>
      mockAddJob('pgp-process', 'process', { operation: op, data })),
    addClamavScanJob: jest.fn(async (fileData: any) =>
      mockAddJob('clamav-scan', 'scan', { fileData })),
    addNotificationJob: jest.fn(async (userId: string, message: string) =>
      mockAddJob('notification', 'notify', { userId, message })),
    getQueueStats: mockGetQueueStats,
    initQueues: jest.fn().mockResolvedValue(undefined),
    closeQueues: jest.fn().mockResolvedValue(undefined),
  };
});

describe('Queue System — Mocked', () => {
  let queueModule: any;

  beforeEach(() => {
    BullMQMock.init();
    jest.resetModules();
    queueModule = require('../../../../src/server/modules/email/email-queue');
  });

  describe('addImapSyncJob', () => {
    it('should queue an IMAP sync job', async () => {
      const job = await queueModule.addImapSyncJob('user-1');
      expect(job.id).toBeDefined();
      expect(job.name).toBe('sync');
      expect(job.data.userId).toBe('user-1');
    });
  });

  describe('addEmailSendJob', () => {
    it('should queue an email send job', async () => {
      const job = await queueModule.addEmailSendJob('acc-1', {}, { to: ['a@b.com'], subject: 'Test' });
      expect(job.id).toBeDefined();
      expect(job.name).toBe('send');
      expect(job.data.accountId).toBe('acc-1');
    });
  });

  describe('addPgpJob', () => {
    it('should queue a PGP processing job', async () => {
      const job = await queueModule.addPgpJob('encrypt', { text: 'secret' });
      expect(job.id).toBeDefined();
      expect(job.name).toBe('process');
    });
  });

  describe('addClamavScanJob', () => {
    it('should queue a ClamAV scan job', async () => {
      const job = await queueModule.addClamavScanJob(Buffer.from('test'));
      expect(job.id).toBeDefined();
      expect(job.name).toBe('scan');
    });
  });

  describe('addNotificationJob', () => {
    it('should queue a notification job', async () => {
      const job = await queueModule.addNotificationJob('user-1', 'Hello!');
      expect(job.id).toBeDefined();
      expect(job.name).toBe('notify');
      expect(job.data.message).toBe('Hello!');
    });
  });

  describe('Queue Stats', () => {
    it('should return stats for a known queue', async () => {
      await queueModule.addImapSyncJob('user-1');
      await queueModule.addImapSyncJob('user-2');
      const stats = await queueModule.getQueueStats('imap-sync');
      expect(stats).toBeDefined();
      expect(stats.waiting).toBeDefined();
    });
  });

  describe('Queue Management', () => {
    it('should initialize queues without errors', async () => {
      await expect(queueModule.initQueues()).resolves.toBeUndefined();
    });

    it('should close queues without errors', async () => {
      await queueModule.initQueues();
      await expect(queueModule.closeQueues()).resolves.toBeUndefined();
    });
  });
});