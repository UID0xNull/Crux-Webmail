// ============================================================================
// Crux-Webmail — Mail Contracts: Interfaces IMAP
// ============================================================================
// Contrato para abstracción IMAP. Cada implementación de protocolo debe
// cumplir esta interfaz para ser consumida por el dominio.
// ============================================================================

import { EventEmitter } from 'node:events';
import type { Buffer } from 'node:buffer';

import type {
  IMailMessage,
  IMailbox,
  ISearchResult,
  ISyncResponse,
  IConnectionInfo,
  ISearchQuery,
  IAccountConfig,
  IMailAddress,
} from './types';

export interface IImapAdapter {
  // --- Lifecycle ---
  connect(config: IAccountConfig): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionInfo(): IConnectionInfo;

  // --- Mailboxes ---
  listMailboxes(config: IAccountConfig): Promise<IMailbox[]>;
  openMailbox(config: IAccountConfig, mailbox: string): Promise<void>;
  createMailbox(config: IAccountConfig, name: string): Promise<void>;
  deleteMailbox(config: IAccountConfig, name: string): Promise<void>;
  renameMailbox(config: IAccountConfig, oldName: string, newName: string): Promise<void>;

  // --- Search ---
  search(config: IAccountConfig, query: ISearchQuery): Promise<ISearchResult>;

  // --- Fetch ---
  fetchMessage(config: IAccountConfig, mailbox: string, uid: string): Promise<IMailMessage | null>;
  fetchMessages(config: IAccountConfig, mailbox: string, uids: string[]): Promise<IMailMessage[]>;
  fetchHeaders(config: IAccountConfig, mailbox: string, uids: string[]): Promise<Partial<IMailMessage>[]>;
  fetchBody(config: IAccountConfig, mailbox: string, uid: string, partIndex: string): Promise<Buffer>;
  fetchRaw(config: IAccountConfig, mailbox: string, uid: string): Promise<Buffer>;

  // --- Flags ---
  setFlags(config: IAccountConfig, mailbox: string, uid: string, flags: string[], add: boolean): Promise<void>;
  clearFlags(config: IAccountConfig, mailbox: string, uid: string, flags: string[]): Promise<void>;

  // --- Mutations ---
  deleteMessages(config: IAccountConfig, mailbox: string, uids: string[]): Promise<void>;
  moveMessages(config: IAccountConfig, fromMailbox: string, toMailbox: string, uids: string[]): Promise<void>;
  copyMessages(config: IAccountConfig, fromMailbox: string, toMailbox: string, uids: string[]): Promise<string[]>;

  // --- IDLE / Sync ---
  startIdle(config: IAccountConfig, mailbox: string): Promise<EventEmitter>;
  checkForChanges(config: IAccountConfig, mailbox: string, modSeq?: string): Promise<ISyncResponse>;

  // --- Capabilities ---
  getCapabilities(): string[];
  supportsCapability(capability: string): boolean;
}