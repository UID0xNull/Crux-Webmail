// ============================================================================
// Crux-Webmail — SMTP Service (Nodemailer)
// ============================================================================
// Envío de emails con OpenPGP encryption support, templates, retry logic.
// ============================================================================

import nodemailer from 'nodemailer';
import { auditLogger } from '../../utils/audit-logger';
import { openpgp } from 'openpgp';

// ------------------------------------------------------------------
// Transporter Pool
// ------------------------------------------------------------------
interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

const transporters = new Map<string, nodemailer.Transporter>();

async function getTransporter(accountId: string, config: SMTPConfig): Promise<nodemailer.Transporter> {
  if (transporters.has(accountId)) {
    return transporters.get(accountId)!;
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: config.password,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  transporters.set(accountId, transporter);

  await transporter.verify();
  
  auditLogger.info('SMTP transporter connected', {
    actor_id: accountId,
    metadata: { host: config.host },
  });

  return transporter;
}

// ------------------------------------------------------------------
// Send Email
// ------------------------------------------------------------------
export interface SendEmailOptions {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export async function sendEmail(
  accountId: string,
  smtpConfig: SMTPConfig,
  options: SendEmailOptions,
  retryCount: number = 3
): Promise<{ messageId: string; status: 'sent' }> {
  let transporter: nodemailer.Transporter;
  
  try {
    transporter = await getTransporter(accountId, smtpConfig);
  } catch (err) {
    auditLogger.error('SMTP transporter creation failed', {
      actor_id: accountId,
      metadata: { error: (err as Error).message },
    });
    throw new Error('SMTP connection failed');
  }

  const mailOptions: nodemailer.SendMailOptions = {
    from: options.from,
    to: options.to.join(', '),
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments,
  };

  if (options.cc && options.cc.length > 0) {
    mailOptions.cc = options.cc.join(', ');
  }

  if (options.bcc && options.bcc.length > 0) {
    mailOptions.bcc = options.bcc.join(', ');
  }

  try {
    const result = await transporter.sendMail(mailOptions);

    auditLogger.info('Email sent successfully', {
      actor_id: accountId,
      metadata: {
        message_id: result.messageId,
        to: options.to,
      },
    });

    return { messageId: result.messageId, status: 'sent' };
  } catch (err) {
    if (retryCount > 0) {
      auditLogger.warn(`Email send failed, retrying (${retryCount} left)`, {
        actor_id: accountId,
        metadata: { error: (err as Error).message },
      });
      await new Promise(r => setTimeout(r, Math.pow(2, 3 - retryCount) * 1000));
      return sendEmail(accountId, smtpConfig, options, retryCount - 1);
    }

    auditLogger.error('Email send failed after all retries', {
      actor_id: accountId,
      metadata: { error: (err as Error).message },
    });
    throw err;
  }
}

// ------------------------------------------------------------------
// Send PGP Encrypted Email
// ------------------------------------------------------------------
export async function sendEncryptedEmail(
  accountId: string,
  smtpConfig: SMTPConfig,
  options: SendEmailOptions,
  recipientPublicKey: string
): Promise<{ messageId: string; status: 'sent' }> {
  try {
    // Encrypt the message body with recipient's PGP key
    const encryptedText = await openpgp.encrypt({
      message: openpgp.createMessage({
        text: options.text || '',
      }),
      encryptionKeys: await openpgp.readKey({ armoredKey: recipientPublicKey }),
    });

    // Replace body with encrypted content
    const encryptedOptions: SendEmailOptions = {
      ...options,
      text: typeof encryptedText === 'string' ? encryptedText : encryptedText.toString(),
      html: undefined, // No HTML for encrypted messages
    };

    return sendEmail(accountId, smtpConfig, encryptedOptions);
  } catch (err) {
    auditLogger.error('PGP encryption failed', {
      actor_id: accountId,
      metadata: { error: (err as Error).message },
    });
    throw new Error('PGP_ENCRYPTION_ERROR');
  }
}

// ------------------------------------------------------------------
// Send Template Email
// ------------------------------------------------------------------
export interface TemplateVars {
  name: string;
  value: string;
}

function renderTemplate(template: string, vars: TemplateVars[]): string {
  let rendered = template;
  for (const { name, value } of vars) {
    rendered = rendered.replace(new RegExp(`\{${name}\}`, 'g'), value);
  }
  return rendered;
}

const TEMPLATES = {
  welcome: `Hello {name}, welcome to Crux-Webmail!`,
  passwordReset: `Hi {name}, here is your password reset link: {link}`,
  mfaSetup: `Hi {name}, your MFA has been enabled.`,
};

export async function sendTemplateEmail(
  accountId: string,
  smtpConfig: SMTPConfig,
  template: string,
  to: string,
  vars: TemplateVars[]
): Promise<{ messageId: string }> {
  const content = renderTemplate(TEMPLATES[template as keyof typeof TEMPLATES] || '', vars);

  const result = await sendEmail(accountId, smtpConfig, {
    from: smtpConfig.username,
    to: [to],
    subject: `Crux-Webmail Notification`,
    text: content,
  });

  return { messageId: result.messageId };
}

// ------------------------------------------------------------------
// Close all transporters
// ------------------------------------------------------------------
export async function closeAllTransporters(): Promise<void> {
  for (const [id, transporter] of transporters) {
    await transporter.close();
  }
  transporters.clear();
  auditLogger.info('All SMTP transporters closed');
}