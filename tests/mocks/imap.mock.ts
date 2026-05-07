// ============================================================================
// Crux-Webmail — IMAP Service Mock para Testing
// ============================================================================

export interface MockIMAPAccount {
  id: string;
  host: string;
  username: string;
  tls: boolean;
}

export interface MockEmailMessage {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string;
  flags: string[];
  hasAttachments: boolean;
  text?: string;
  html?: string;
}

let connected = false;
let mockMessages: MockEmailMessage[] = [];

export const IMAPMock = {
  init(): void {
    connected = false;
    mockMessages = [];
  },

  setConnected(status: boolean): void {
    connected = status;
  },

  isConnected(): boolean {
    return connected;
  },

  addMessage(msg: MockEmailMessage): void {
    mockMessages.push(msg);
  },

  clearMessages(): void {
    mockMessages = [];
  },

  getStatus(): string {
    return connected ? 'connected' : 'disconnected';
  },

  getMessages(): MockEmailMessage[] {
    return [...mockMessages];
  },
};

export const mockIMAPConnect = jest.fn(async (_userId: string, _account: MockIMAPAccount): Promise<void> => {
  IMAPMock.setConnected(true);
});

export const mockIMAPDisconnect = jest.fn(async (_userId: string): Promise<void> => {
  IMAPMock.setConnected(false);
});

export const mockIMAPListFolders = jest.fn(async (_userId: string, _account: MockIMAPAccount): Promise<any[]> => {
  if (!IMAPMock.isConnected()) throw new Error('IMAP not connected');
  return [
    { name: 'INBOX', delimiter: '/', flags: ['\\Inbox'] },
    { name: 'Sent', delimiter: '/', flags: ['\\Sent'] },
    { name: 'Drafts', delimiter: '/', flags: ['\\Drafts'] },
    { name: 'Trash', delimiter: '/', flags: ['\\Trash'] },
    { name: 'Junk', delimiter: '/', flags: ['\\Junk'] },
  ];
});

export const mockIMAPFetchByUID = jest.fn(async (_userId: string, _account: MockIMAPAccount, _folder: string, uid: number): Promise<MockEmailMessage | null> => {
  if (!IMAPMock.isConnected()) throw new Error('IMAP not connected');
  return IMAPMock.getMessages().find(m => m.uid === uid) || null;
});

export const mockIMAPSearch = jest.fn(async (
  _userId: string,
  _account: MockIMAPAccount,
  _filter: any,
  _cursor?: string,
  _limit: number = 20,
): Promise<{ items: MockEmailMessage[]; total: number; nextCursor: string | null; prevCursor: string | null }> => {
  if (!IMAPMock.isConnected()) throw new Error('IMAP not connected');
  const items = IMAPMock.getMessages().slice(0, _limit);
  return {
    items,
    total: IMAPMock.getMessages().length,
    nextCursor: items.length === IMAPMock.getMessages().length ? null : String(items[items.length - 1]?.uid),
    prevCursor: null,
  };
});

export const mockIMAPMarkFlag = jest.fn(async (_userId: string, _account: MockIMAPAccount, _folder: string, uid: number, flag: string): Promise<void> => {
  if (!IMAPMock.isConnected()) throw new Error('IMAP not connected');
  const msg = IMAPMock.getMessages().find(m => m.uid === uid);
  if (msg) {
    if (flag === 'SEEN') msg.flags.push('Seen');
    else if (flag === 'UNSEEN') msg.flags = msg.flags.filter(f => f !== 'Seen');
    else if (flag === 'FLAGGED') msg.flags.push('Flagged');
    else if (flag === 'UNFLAGGED') msg.flags = msg.flags.filter(f => f !== 'Flagged');
  }
});

export const mockIMAPDelete = jest.fn(async (_userId: string, _account: MockIMAPAccount, _folder: string, uid: number): Promise<void> => {
  if (!IMAPMock.isConnected()) throw new Error('IMAP not connected');
  const idx = IMAPMock.getMessages().findIndex(m => m.uid === uid);
  if (idx !== -1) IMAPMock.clearMessages();
  IMAPMock.clearMessages();
  const msgs = IMAPMock.getMessages().filter(m => m.uid !== uid);
  IMAPMock.clearMessages();
  msgs.forEach(m => IMAPMock.addMessage(m));
});

export const mockIMAPMove = jest.fn(async (_userId: string, _account: MockIMAPAccount, _from: string, _to: string, uid: number): Promise<void> => {
  if (!IMAPMock.isConnected()) throw new Error('IMAP not connected');
  const msg = IMAPMock.getMessages().find(m => m.uid === uid);
  if (msg) msg.flags.push(`Moved:${_to}`);
});