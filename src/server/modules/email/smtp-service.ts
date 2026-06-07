// ============================================================================
// Crux-Webmail — SMTP Service (Nodemailer)
// ============================================================================
import nodemailer from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';
import * as openpgp from 'openpgp';
import { buildMailTlsOptions } from './mail-tls';

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  // SAN esperado en el cert de Postfix (validación TLS). Si falta, se valida
  // contra el host de conexión.
  servername?: string;
}

const transporters = new Map<string, nodemailer.Transporter>();

async function getTransporter(_accountId: string, config: SMTPConfig): Promise<nodemailer.Transporter> {
  // El transporter se comparte por cuenta de submission (no por usuario), ya
  // que todos los envíos usan la misma cuenta de servicio.
  const key = `${config.host}:${config.port}:${config.username}`;
  const existing = transporters.get(key);
  if (existing) return existing;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,           // true sólo en 465 (TLS implícito)
    requireTLS: !config.secure,      // 587 → STARTTLS obligatorio
    auth: {
      user: config.username,
      pass: config.password,
    },
    // Zero-Trust: validar el cert de Postfix contra la CA interna + mTLS.
    tls: buildMailTlsOptions(config.servername || config.host),
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  transporters.set(key, transporter);

  await transporter.verify();

  return transporter;
}

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
    throw new Error('SMTP connection failed');
  }

  const attachments: SendMailOptions['attachments'] | undefined =
    options.attachments?.map((att) => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType ?? undefined,
    })) ??
    undefined;

  const mailOptions: SendMailOptions = {
    from: options.from,
    to: options.to.join(', '),
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments,
  };

  if (options.cc && options.cc.length > 0) {
    mailOptions.cc = options.cc.join(', ');
  }

  if (options.bcc && options.bcc.length > 0) {
    mailOptions.bcc = options.bcc.join(', ');
  }

  try {
    const result = await transporter.sendMail(mailOptions);

    return { messageId: result.messageId, status: 'sent' };
  } catch (err) {
    if (retryCount > 0) {
      await new Promise(r => setTimeout(r, Math.pow(2, 3 - retryCount) * 1000));
      return sendEmail(accountId, smtpConfig, options, retryCount - 1);
    }

    throw err;
  }
}

export async function sendEncryptedEmail(
  accountId: string,
  smtpConfig: SMTPConfig,
  options: SendEmailOptions,
  recipientPublicKey: string
): Promise<{ messageId: string; status: 'sent' }> {
  try {
    const message = await openpgp.createMessage({ text: options.text || '' });
    const encryptionKeys = await openpgp.readKey({ armoredKey: recipientPublicKey });

    const encryptedText = await openpgp.encrypt({
      message,
      encryptionKeys,
    });

    const encryptedOptions: SendEmailOptions = {
      ...options,
      text: typeof encryptedText === 'string' ? encryptedText : String(encryptedText),
      html: undefined,
    };

    return sendEmail(accountId, smtpConfig, encryptedOptions);
  } catch (err) {
    throw new Error('PGP_ENCRYPTION_ERROR');
  }
}

export interface TemplateVars {
  name: string;
  value: string;
}

function renderTemplate(template: string, vars: TemplateVars[]): string {
  let rendered = template;
  for (const { name, value } of vars) {
    rendered = rendered.replace(new RegExp(`\\{${name}\\}`, 'g'), value);
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
    subject: 'Crux-Webmail Notification',
    text: content,
  });

  return { messageId: result.messageId };
}

export async function closeAllTransporters(): Promise<void> {
  for (const [, transporter] of transporters) {
    await transporter.close();
  }
  transporters.clear();
}