// ============================================================================
// Crux-Webmail — IMAP Bridge Stub (Pool & Connection Wrapper)
// ============================================================================
// Placeholder for IMAP bridge pool. Provides types and singleton to satisfy
// jmap-client.service.ts until full bridge implementation is wired.
// ============================================================================

export interface ImapConnectionWrapper {
  connect(userId: string): Promise<void>;
  search(conditions: any[]): Promise<number[]>;
  fetchMessages(uids: number[], opts: any): Promise<any[]>;
  toJMAPMail(env: any): Promise<any>;
  getMailboxes(): Promise<{ name: string; specialUse: string[] }[]>;
}

export function getImapBridgePool() {
  return {
    getConnection: async (_userId: string): Promise<ImapConnectionWrapper> => {
      throw new Error('IMAP bridge pool not yet wired');
    },
  };
}