import { EventEmitter } from 'node:events';

export interface IAccountConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  accountId: string;
}

export interface IConnectionInfo {
  phase: string;
  host: string;
  port: number;
  secure: boolean;
  connectedAt: string;
  lastActivity: string;
  capabilities: string[];
}

export interface IMailAddress {
  name: string;
  email: string;
}

export interface IFlags {
  seen: boolean;
  answered: boolean;
  flagged: boolean;
  deleted: boolean;
  draft: boolean;
  recent: boolean;
  custom: string[];
}

export interface ISearchQuery {
  flags?: Partial<IFlags>;
  since?: string;
  until?: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachments?: boolean;
  sizeMin?: number;
  sizeMax?: number;
  mailbox?: string;
  limit?: number;
  offset?: number;
}

export interface ISearchResult {
  uids: string[];
  total: number;
}

export interface IMailMessage {
  uid: string;
  messageId: string;
  subject: string;
  from: IMailAddress[];
  to: IMailAddress[];
  cc: IMailAddress[];
  bcc: IMailAddress[];
  date: string;
  size: number;
  flags: IFlags;
  hasAttachments: boolean;
  preview: string;
  bodyText: string;
  bodyHtml: string;
  headers: Record<string, string[]>;
  attachmentCount: number;
}

export interface IMailbox {
  id: string;
  name: string;
  path: string;
  role: MailboxRole;
  messageCount: number;
  unseenCount: number;
  delimiter: string;
}

export type MailboxRole = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom';

export interface ISyncResponse {
  added: string[];
  modified: string[];
  removed: string[];
  state: string;
}

export interface IImapAdapter {
  connect(config: IAccountConfig): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionInfo(): IConnectionInfo;
  listMailboxes(config: IAccountConfig): Promise<IMailbox[]>;
  openMailbox(config: IAccountConfig, mailbox: string): Promise<void>;
  createMailbox(config: IAccountConfig, name: string): Promise<void>;
  deleteMailbox(config: IAccountConfig, name: string): Promise<void>;
  renameMailbox(config: IAccountConfig, oldName: string, newName: string): Promise<void>;
  search(config: IAccountConfig, query: ISearchQuery): Promise<ISearchResult>;
  fetchMessage(config: IAccountConfig, mailbox: string, uid: string): Promise<IMailMessage | null>;
  fetchMessages(config: IAccountConfig, mailbox: string, uids: string[]): Promise<IMailMessage[]>;
  fetchHeaders(config: IAccountConfig, mailbox: string, uids: string[]): Promise<Partial<IMailMessage>[]>;
  fetchBody(config: IAccountConfig, mailbox: string, uid: string, partIndex: string): Promise<Buffer>;
  fetchRaw(config: IAccountConfig, mailbox: string, uid: string): Promise<Buffer>;
  setFlags(config: IAccountConfig, mailbox: string, uid: string, flags: string[], add: boolean): Promise<void>;
  clearFlags(config: IAccountConfig, mailbox: string, uid: string, flags: string[]): Promise<void>;
  deleteMessages(config: IAccountConfig, mailbox: string, uids: string[]): Promise<void>;
  moveMessages(config: IAccountConfig, fromMailbox: string, toMailbox: string, uids: string[]): Promise<void>;
  copyMessages(config: IAccountConfig, fromMailbox: string, toMailbox: string, uids: string[]): Promise<string[]>;
  startIdle(config: IAccountConfig, mailbox: string): Promise<EventEmitter>;
  checkForChanges(config: IAccountConfig, mailbox: string, _modSeq?: string): Promise<ISyncResponse>;
  getCapabilities(): string[];
  supportsCapability(capability: string): boolean;
}