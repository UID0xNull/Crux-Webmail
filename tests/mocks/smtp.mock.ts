// ============================================================================
// Crux-Webmail — SMTP Service Mock para Testing
// ============================================================================

export interface MockSendOptions {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

let sentEmails: MockSendOptions[] = [];
let shouldFail = false;

export const SMTPMock = {
  init(): void {
    sentEmails = [];
    shouldFail = false;
  },

  setShouldFail(fail: boolean): void {
    shouldFail = fail;
  },

  getSentEmails(): MockSendOptions[] {
    return [...sentEmails];
  },

  getLastSent(): MockSendOptions | null {
    return sentEmails[sentEmails.length - 1] || null;
  },

  getSentCount(): number {
    return sentEmails.length;
  },
};

export const mockSMTPSend = jest.fn(async (_config: any, options: MockSendOptions): Promise<{ messageId: string }> => {
  if (shouldFail) throw new Error('SMTP connection refused');
  const messageId = `<mock-${Date.now()}@crux-webmail.test>`;
  sentEmails.push({ ...options });
  return { messageId };
});

export const mockSMTPClose = jest.fn(async (): Promise<void> => {
  // No-op
});