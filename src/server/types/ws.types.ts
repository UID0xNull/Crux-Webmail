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
// Server → Client Events
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