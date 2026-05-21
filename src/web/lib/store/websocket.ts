// ============================================================================
// Crux-Webmail Frontend — WebSocket Store (Zustand)
// Manages real-time connection, reconnection, event handling, message relay
// ============================================================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useAuthStore } from './auth';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export type WSState = 'disconnected' | 'connecting' | 'authenticated' | 'connected' | 'reconnecting' | 'error';

interface WSNotification {
  id: string;
  type: 'new_message' | 'flag_change' | 'deleted' | 'sync_status' | 'folder_update';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  data: Record<string, unknown>;
}

interface WSConnectionInfo {
  state: WSState;
  latency: number | null;
  reconnectAttempts: number;
  channels: string[];
  lastPing: number | null;
  url: string;
}

interface WebSocketStore {
  // State
  connection: WSConnectionInfo | null;
  notifications: WSNotification[];
  isConnected: boolean;
  pendingMessages: number;

  // Actions
  connect: () => void;
  disconnect: () => void;
  subscribe: (channels: string[]) => void;
  unsubscribe: (channels: string[]) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  getUnreadCount: () => number;
}

// ------------------------------------------------------------------
// Singleton WebSocket reference
// ------------------------------------------------------------------
let _ws: WebSocket | null = null;
let _pingInterval: ReturnType<typeof setInterval> | null = null;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 1000;
const PING_INTERVAL = 25_000;

// ------------------------------------------------------------------
// Store
// ------------------------------------------------------------------
export const useWebSocketStore = create<WebSocketStore>()(
  subscribeWithSelector((set, get) => ({
    // ----------------------------------------------------------------
    // Initial state
    // ----------------------------------------------------------------
    connection: null,
    notifications: [],
    isConnected: false,
    pendingMessages: 0,

    // ----------------------------------------------------------------
    // Connect
    // ----------------------------------------------------------------
    connect: () => {
      wasManual = false; // reset so auto-reconnect works on next close
      const { token, sessionId } = useAuthStore.getState();
      if (!token || !sessionId) {
        set({ isConnected: false });
        return;
      }

      let t0 = performance.now();

      // Close existing if any
      if (_ws) {
        _ws.close();
      }

      const wsUrl = buildWsUrl(token);

      set((s: any) => ({
        connection: {
          state: 'connecting',
          latency: null,
          // Preserve existing reconnectAttempts so exponential backoff works.
          // Only reset to 0 on successful READY message.
          reconnectAttempts: s.connection?.reconnectAttempts ?? 0,
          channels: s.connection?.channels ?? [],
          lastPing: null,
          url: wsUrl,
        },
      }));

      _ws = new WebSocket(wsUrl);

      _ws.onopen = () => {
        t0 = performance.now();
        // Send AUTH
        _ws?.send(JSON.stringify({
          type: 'AUTH',
          payload: {
            token,
            sessionId,
          },
        }));
      };

      _ws.onmessage = (event) => {
        const t1 = performance.now();
        const latency = t1 - (get().connection?.lastPing || t0);

        let data: unknown;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        handleMessage(data as Record<string, unknown>, set, get);

        set((s) => {
          if (!s.connection) return s;
          return {
            connection: {
              ...s.connection,
              latency,
            },
          };
        });
      };

      _ws.onclose = (event) => {
        set({ isConnected: false });
        set((s) => {
          if (!s.connection) return s;
          return {
            connection: {
              ...s.connection,
              state: 'disconnected',
            },
          };
        });

        if (event.code !== 1000 && !wasManual) {
          scheduleReconnect(set, get);
        }
      };

      _ws.onerror = () => {
        set((s) => {
          if (!s.connection) return s;
          return {
            connection: {
              ...s.connection,
              state: 'error',
            },
          };
        });
      };
    },

    // ----------------------------------------------------------------
    // Disconnect
    // ----------------------------------------------------------------
    disconnect: () => {
      // Signal onclose handler to skip auto-reconnect
      wasManual = true;
      if (_ws) {
        _ws.close(1000, 'Client disconnect');
        _ws = null;
      }
      if (_pingInterval) {
        clearInterval(_pingInterval);
        _pingInterval = null;
      }
      set({
        isConnected: false,
        connection: null,
      });
    },

    // ----------------------------------------------------------------
    // Subscribe
    // ----------------------------------------------------------------
    subscribe: (channels: string[]) => {
      if (_ws?.readyState === 1) {
        _ws.send(JSON.stringify({
          type: 'SUBSCRIBE',
          payload: { channels },
        }));
        set((s) => {
          if (!s.connection) return s;
          return {
            connection: {
              ...s.connection,
              channels: [...new Set([...s.connection.channels, ...channels])],
            },
          };
        });
      }
    },

    // ----------------------------------------------------------------
    // Unsubscribe
    // ----------------------------------------------------------------
    unsubscribe: (channels: string[]) => {
      if (_ws?.readyState === 1) {
        _ws.send(JSON.stringify({
          type: 'UNSUBSCRIBE',
          payload: { channels },
        }));
        set((s) => {
          if (!s.connection) return s;
          const newChannels = s.connection.channels.filter(
            (ch) => !channels.includes(ch)
          );
          return {
            connection: { ...s.connection, channels: newChannels },
          };
        });
      }
    },

    // ----------------------------------------------------------------
    // Notification management
    // ----------------------------------------------------------------
    markNotificationRead: (id: string) => {
      set((s) => ({
        notifications: s.notifications.map(
          (n) => n.id === id ? { ...n, read: true } : n
        ),
        pendingMessages: Math.max(
          s.pendingMessages - 1,
          0
        ),
      }));
    },

    clearNotifications: () => {
      set({
        notifications: [],
        pendingMessages: 0,
      });
    },

    getUnreadCount: () => {
      return get().notifications.filter((n) => !n.read).length;
    },
  }))
);

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function buildWsUrl(token: string): string {
  const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = process.env.NEXT_PUBLIC_WS_HOST || window.location.host;
  return `${proto}//${host}/ws?token=${encodeURIComponent(token)}`;
}

let wasManual = false;

function handleMessage(
  data: Record<string, unknown>,
  set: any,
  get: () => any
): void {
  const msgType = data.type as string;
  const payload = data.payload as Record<string, unknown> | undefined;

  switch (msgType) {
    case 'READY': {
      set((s: any) => ({
        isConnected: true,
        connection: s.connection
          ? { ...s.connection, state: 'connected', lastPing: Date.now(), reconnectAttempts: 0 }
          : s.connection,
      }));
      // Auto-subscribe to mail channels
      const currentChannels = get().connection?.channels || [];
      if (currentChannels.length === 0) {
        if (_ws?.readyState === 1) {
          _ws.send(JSON.stringify({
            type: 'SUBSCRIBE',
            payload: {
              channels: ['mail:new', 'mail:flags', 'mail:delete', 'mail:folder-counts', 'sync:status'],
            },
          }));
        }
        set((s: any) => {
          if (!s.connection) return s;
          return {
            connection: {
              ...s.connection,
              channels: ['mail:new', 'mail:flags', 'mail:delete', 'mail:folder-counts', 'sync:status'],
            },
          };
        });
      }
      startPing();
      break;
    }

    case 'PONG':
      set((s: any) => {
        if (!s.connection) return s;
        return {
          connection: { ...s.connection, lastPing: Date.now() },
        };
      });
      break;

    case 'NEW_MESSAGE': {
      const notif: WSNotification = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: 'new_message',
        title: 'New Message',
        message: (payload as any)?.subject || 'You have a new message',
        timestamp: Date.now(),
        read: false,
        data: payload || {},
      };
      set((s: any) => ({
        notifications: [notif, ...s.notifications].slice(0, 100),
        pendingMessages: s.pendingMessages + 1,
      }));
      break;
    }

    case 'MESSAGE_FLAG_CHANGED':
    case 'MESSAGE_DELETED':
    case 'FOLDER_COUNTS_UPDATED':
    case 'SYNC_STATUS':
    case 'CONNECTION_WARNING':
    case 'ERROR':
      // Dispatch to React events or refresh affected cache
      // Handled by custom hook useEffect listeners
      break;
  }
}

function startPing(): void {
  if (_pingInterval) clearInterval(_pingInterval);

  _pingInterval = setInterval(() => {
    if (_ws?.readyState === 1) {
      _ws.send(JSON.stringify({ type: 'PING' }));
    }
  }, PING_INTERVAL);
}

function scheduleReconnect(set: any, get: () => any): void {
  const attempts = get().connection?.reconnectAttempts ?? 0;
  if (attempts >= MAX_RECONNECT_ATTEMPTS) return;

  const delay = RECONNECT_BASE_DELAY * Math.pow(2, attempts);

  set((s: any) => {
    if (!s.connection) return s;
    return {
      connection: {
        ...s.connection,
        state: 'reconnecting',
        reconnectAttempts: s.connection.reconnectAttempts + 1,
      },
    };
  });

  setTimeout(() => {
    const store = get();
    store.connect();
  }, Math.min(delay, 30_000));
}