// ============================================================================
// Crux-Webmail — SMTP Bridge Stub
// ============================================================================
// Placeholder for SMTP bridge to satisfy jmap-client.service.ts.
// ============================================================================

export interface SmtpRelayResult {
  accepted: string[];
  rejected: string[];
  dkimSigned: boolean;
  tlsUsed: boolean;
  envelopeId: string;
}

export interface SmtpBridge {
  sendMail(opts: {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text: string;
    html?: string;
  }): Promise<SmtpRelayResult>;
}

let _smtpBridge: SmtpBridge | null = null;

export function getSmtpBridge(): SmtpBridge {
  if (!_smtpBridge) {
    _smtpBridge = {
      sendMail: async () => ({ accepted: [], rejected: [], dkimSigned: false, tlsUsed: false, envelopeId: 'stub-id' }),
    };
  }
  return _smtpBridge;
}