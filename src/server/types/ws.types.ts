// ============================================================================
// Crux-Webmail Server — WebSocket Types (local mirror of shared WS types)
// ============================================================================

// ------------------------------------------------------------------
// Client → Server Events
// ------------------------------------------------------------------
export interface WSClientMessage {
  type: WSClientEventType;
  id?: string;
  payload: Record<string, unknown>;
}

export type WSClientEventType =
  | 'AUTH'
  | 'PING'
  | 'SUBSCRIBE'
  | 'UNSUBSCRIBE'
  | 'FLAG_UPDATE'
  | 'FOLDER_SYNC';

// ------------------------------------------------------------------
// Server → Client Events (typed payloads)
// ------------------------------------------------------------------
export interface WSServerMessage {
  type: WSServerEventType;
  id?: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export type WSServerEventType =
  | 'READY'
  | 'ERROR'
  | 'PONG'
  | 'NEW_MESSAGE'
  | 'MESSAGE_FLAG_CHANGED'
  | 'MESSAGE_DELETED'
  | 'FOLDER_COUNTS_UPDATED'
  | 'SYNC_STATUS'
  | 'CONNECTION_WARNING'
  | 'DISCONNECTED';

// Strictly typed message union (for new code).
export type TypedWSServerMessage =
  | ReadyMessage
  | ErrorMessage
  | PongMessage
  | NewMessageEventMsg
  | MessageFlagChangedEventMsg
  | MessageDeletedEventMsg
  | FolderCountsUpdatedEventMsg
  | SyncStatusEventMsg
  | ConnectionWarningMsg
  | DisconnectedMessage;

export interface ReadyPayload {
  clientId: string;
  userId: string;
  channels: WSChannel[];
  heartbeatMs: number;
}
export interface ReadyMessage extends WSServerMessageBase<'READY'> { payload: ReadyPayload; }

export interface ErrorPayload {
  message: string;
}
export interface ErrorMessage extends WSServerMessageBase<'ERROR'> { payload: ErrorPayload; }

export interface PongPayload {
  timestamp: number;
}
export interface PongMessage extends WSServerMessageBase<'PONG'> { payload: PongPayload; }

export interface NewMessageEventMsg extends WSServerMessageBase<'NEW_MESSAGE'> {
  payload: Record<string, unknown>;
}

export interface MessageFlagChangedEventMsg extends WSServerMessageBase<'MESSAGE_FLAG_CHANGED'> {
  payload: Record<string, unknown>;
}

export interface MessageDeletedEventMsg extends WSServerMessageBase<'MESSAGE_DELETED'> {
  payload: Record<string, unknown>;
}

export interface FolderCountsUpdatedEventMsg extends WSServerMessageBase<'FOLDER_COUNTS_UPDATED'> {
  payload: Record<string, unknown>;
}

export interface SyncStatusPayload {
  status: 'idle' | 'syncing' | 'error';
  progress?: number;
  mailbox?: string;
}
export interface SyncStatusEventMsg extends WSServerMessageBase<'SYNC_STATUS'> {
  payload: SyncStatusPayload;
}

export interface ConnectionWarningPayload {
  message: string;
  disconnectIn: number;
}
export interface ConnectionWarningMsg extends WSServerMessageBase<'CONNECTION_WARNING'> {
  payload: ConnectionWarningPayload;
}

export interface DisconnectedPayload {
  reason: string;
}
export interface DisconnectedMessage extends WSServerMessageBase<'DISCONNECTED'> {
  payload: DisconnectedPayload;
}

// Base used to define strongly-typed server messages.
interface WSServerMessageBase<T extends WSServerEventType> {
  type: T;
  id?: string;
  timestamp: number;
}

// Factory helper for consistent, typed WSServerMessage construction across modules.
export function createServerMessage<T extends WSServerEventType>(
  type: T,
  payload: Record<string, unknown>,
  { id, ts = Date.now() }?: {
    id?: string;
    ts?: number;
  },
): WSServerMessage {
  return { type, id, timestamp: ts, payload } as WSServerMessage;
}

// ------------------------------------------------------------------
// Channels for selective subscription
// ------------------------------------------------------------------
export type WSChannel =
  | 'mail:new'
  | 'mail:flags'
  | 'mail:delete'
  | 'mail:folder-counts'
  | 'sync:status';

// ------------------------------------------------------------------
// Connection state
// ------------------------------------------------------------------
export type WSConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'authenticated'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface WSConnectionStatus {
  state: WSConnectionState;
  channels: WSChannel[];
  reconnectAttempts: number;
  lastPing: number | null;
  latency: number | null;
}

// ------------------------------------------------------------------
// Real-time event payloads
// ------------------------------------------------------------------
export interface NewMessageEvent {
  mailboxId: string;
  message: Record<string, unknown>;
}

export interface FlagChangedEvent {
  messageId: string;
  flags: string[];
  mailboxId: string;
}

export interface DeletedEvent {
  messageId: string;
  mailboxId: string;
}

export interface FolderCountsEvent {
  counts: Record<string, { total: number; unseen: number }>;
}

export interface SyncStatusEvent {
  status: 'idle' | 'syncing' | 'error';
  progress?: number;
  mailbox?: string;
}

// ------------------------------------------------------------------
// Bridge events — mail service → gateway relay
// ------------------------------------------------------------------
export interface MailEventPayload {
  type: 'new' | 'flagged' | 'deleted' | 'moved' | 'synced';
  userId: string;
  data: Record<string, unknown>;
}