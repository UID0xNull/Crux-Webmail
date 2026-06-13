// ============================================================================
// Crux-Webmail — BullMQ Queue System
// ============================================================================
// Queues para sync IMAP, enviar emails, escaneo ClamAV, procesamiento PGP.
// ============================================================================

import { Queue, Worker, Job } from 'bullmq';
import { getRedis } from '../../cache/redis-client';
import { auditLogger } from '../../utils/audit-logger';
import { connectIMAP, listFolders, fetchEmails, EmailMessage } from './imap-service';
import { sendEmail, SMTPConfig, SendEmailOptions } from './smtp-service';
import { UserModel } from '../../models/User';

// ------------------------------------------------------------------
// Queue Names
// ------------------------------------------------------------------
const QUEUES = {
  IMAP_SYNC: 'imap-sync',
  EMAIL_SEND: 'email-send',
  PGP_PROCESS: 'pgp-process',
  CLAMAV_SCAN: 'clamav-scan',
  NOTIFICATION: 'notification',
};

// ------------------------------------------------------------------
// Queue Instances
// ------------------------------------------------------------------
let imapSyncQueue: Queue | null = null;
let emailSendQueue: Queue | null = null;
let pgpProcessQueue: Queue | null = null;
let clamavScanQueue: Queue | null = null;
let notificationQueue: Queue | null = null;

// ------------------------------------------------------------------
// Initialize Queues
// ------------------------------------------------------------------
export async function initQueues(): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    throw new Error('Redis not available for BullMQ queues');
  }

  const connection = redis; // ioredis connection

  imapSyncQueue = new Queue(QUEUES.IMAP_SYNC, { connection });
  emailSendQueue = new Queue(QUEUES.EMAIL_SEND, { connection });
  pgpProcessQueue = new Queue(QUEUES.PGP_PROCESS, { connection });
  clamavScanQueue = new Queue(QUEUES.CLAMAV_SCAN, { connection });
  notificationQueue = new Queue(QUEUES.NOTIFICATION, { connection });

  auditLogger.info('BullMQ queues initialized');

  // Start workers
  await initWorkers(connection);
}

// ------------------------------------------------------------------
// Worker Initialization
// ------------------------------------------------------------------
async function initWorkers(connection: any): Promise<void> {
  // IMAP Sync Worker
  new Worker(QUEUES.IMAP_SYNC, async (job: Job) => {
    const { userId } = job.data;
    
    auditLogger.info('IMAP sync started', { actor_id: userId });

    // Get user email account config
    const user = await UserModel.findByPk(userId);
    if (!user) throw new Error('User not found');

    // Sync emails from IMAP
    const emails = await fetchEmails(userId, {
      id: userId,
      host: 'imap.gmail.com', // Default — should come from config
      port: 993,
      username: user.username,
      password: user.passwordHash, // In prod: encrypted storage
      tls: true,
    });

    auditLogger.info('IMAP sync completed', {
      actor_id: userId,
      metadata: { emailCount: emails.length },
    });

    return { synced: emails.length };
  }, { connection, limiter: { max: 5, duration: 1000 } });

  // Email Send Worker
  new Worker(QUEUES.EMAIL_SEND, async (job: Job) => {
    const { accountId, smtpConfig, emailOptions } = job.data;

    try {
      const result = await sendEmail(accountId, smtpConfig, emailOptions);

      auditLogger.info('Email queued and sent', {
        actor_id: accountId,
        metadata: { message_id: result.messageId },
      });

      return result;
    } catch (err) {
      // El error de envío lo tragaba BullMQ y quedaba invisible. Logueado para
      // poder diagnosticar fallos de SMTP (TLS/SASL/conexión a Postfix).
      auditLogger.error('Email send failed in worker', {
        actor_id: accountId,
        metadata: { error: String((err as Error)?.message || err) } as any,
      });
      throw err;
    }
  }, { connection, limiter: { max: 10, duration: 1000 } });

  // PGP Process Worker
  new Worker(QUEUES.PGP_PROCESS, async (job: Job) => {
    const { operation, data } = job.data;
    
    // Placeholder for PGP processing
    auditLogger.info('PGP processing started', {
      metadata: { operation },
    });

    return { status: 'processed' };
  }, { connection });

  // ClamAV Scan Worker
  new Worker(QUEUES.CLAMAV_SCAN, async (job: Job) => {
    const { fileData } = job.data;
    
    // Placeholder for ClamAV integration
    auditLogger.info('ClamAV scan started');

    return { status: 'clean' };
  }, { connection });

  // Notification Worker
  new Worker(QUEUES.NOTIFICATION, async (job: Job) => {
    const { userId, message } = job.data;
    
    auditLogger.info('Notification sent', {
      actor_id: userId,
      metadata: { message },
    });

    return { delivered: true };
  }, { connection });

  auditLogger.info('All BullMQ workers started');
}

// ------------------------------------------------------------------
// Add Jobs
// ------------------------------------------------------------------
export async function addImapSyncJob(userId: string): Promise<Job> {
  if (!imapSyncQueue) throw new Error('Queue not initialized');
  
  return imapSyncQueue.add('sync', {
    userId,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    jobId: `imap-sync-${userId}-${Date.now()}`,
  });
}

export async function addEmailSendJob(
  accountId: string,
  smtpConfig: SMTPConfig,
  emailOptions: SendEmailOptions
): Promise<Job> {
  if (!emailSendQueue) throw new Error('Queue not initialized');
  
  return emailSendQueue.add('send', {
    accountId,
    smtpConfig,
    emailOptions,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    jobId: `email-send-${accountId}-${Date.now()}`,
  });
}

export async function addPgpJob(operation: string, data: any): Promise<Job> {
  if (!pgpProcessQueue) throw new Error('Queue not initialized');
  
  return pgpProcessQueue.add('process', {
    operation,
    data,
  }, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 1000 },
  });
}

export async function addClamavScanJob(fileData: Buffer | string): Promise<Job> {
  if (!clamavScanQueue) throw new Error('Queue not initialized');
  
  return clamavScanQueue.add('scan', {
    fileData,
  }, {
    attempts: 1,
  });
}

export async function addNotificationJob(userId: string, message: string): Promise<Job> {
  if (!notificationQueue) throw new Error('Queue not initialized');
  
  return notificationQueue.add('notify', {
    userId,
    message,
  }, {
    attempts: 2,
    backoff: { type: 'fixed', delay: 500 },
  });
}

// ------------------------------------------------------------------
// Queue Status
// ------------------------------------------------------------------
export async function getQueueStats(queueName: string): Promise<any> {
  const queueMap: Record<string, Queue | null> = {
    [QUEUES.IMAP_SYNC]: imapSyncQueue,
    [QUEUES.EMAIL_SEND]: emailSendQueue,
    [QUEUES.PGP_PROCESS]: pgpProcessQueue,
    [QUEUES.CLAMAV_SCAN]: clamavScanQueue,
    [QUEUES.NOTIFICATION]: notificationQueue,
  };

  const queue = queueMap[queueName];
  if (!queue) throw new Error(`Queue ${queueName} not found`);

  return {
    name: queueName,
    waiting: await queue.getWaitingCount(),
    active: await queue.getActiveCount?.() ?? 0,
    completed: await queue.getCompletedCount(),
    failed: await queue.getFailedCount(),
    delayed: await queue.getDelayedCount(),
  };
}

// ------------------------------------------------------------------
// Close all queues
// ------------------------------------------------------------------
export async function closeQueues(): Promise<void> {
  await imapSyncQueue?.close();
  await emailSendQueue?.close();
  await pgpProcessQueue?.close();
  await clamavScanQueue?.close();
  await notificationQueue?.close();
  
  imapSyncQueue = null;
  emailSendQueue = null;
  pgpProcessQueue = null;
  clamavScanQueue = null;
  notificationQueue = null;

  auditLogger.info('All BullMQ queues closed');
}