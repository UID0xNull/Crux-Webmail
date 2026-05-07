// ============================================================================
// Crux-Webmail Frontend — useWebSocket Hook
// Auto-connects on auth, auto-disconnects on logout, provides real-time events
// ============================================================================

import { useEffect, useCallback } from 'react';
import { useWebSocketStore } from '../lib/store/websocket';
import { useAuthStore } from '../lib/store/auth';

// ------------------------------------------------------------------
// Hook: auto-manage WebSocket lifecycle based on auth state
// ------------------------------------------------------------------
export function useWebSocket(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const connect = useWebSocketStore((s) => s.connect);
  const disconnect = useWebSocketStore((s) => s.disconnect);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }
  }, [isAuthenticated, connect, disconnect]);
}

// ------------------------------------------------------------------
// Hook: subscribe to real-time events with callbacks
// ------------------------------------------------------------------
export interface RealTimeEventHandlers {
  onNewMessage?: (data: Record<string, unknown>) => void;
  onFlagChanged?: (data: Record<string, unknown>) => void;
  onDeleted?: (data: Record<string, unknown>) => void;
  onSyncStatus?: (data: Record<string, unknown>) => void;
  onError?: (message: string) => void;
}

export function useRealTimeEvents(handlers: RealTimeEventHandlers = {}): void {
  const ws = useWebSocketStore((s) => {
    if (s.connection?.state === 'connected') return true;
    return false;
  });

  const addNotification = useWebSocketStore((s) => s.notifications);

  useEffect(() => {
    if (!ws) return;

    // Listen to store changes for new notifications
    const unsubscribe = useWebSocketStore.subscribe(
      (state) => state.notifications,
      (notifications) => {
        for (const notif of notifications) {
          if (notif.read) continue;

          switch (notif.type) {
            case 'new_message':
              handlers.onNewMessage?.(notif.data);
              break;
          }
        }
      }
    );

    return unsubscribe;
  }, [ws, handlers]);
}

// ------------------------------------------------------------------
// Hook: connection status + UI state
// ------------------------------------------------------------------
export function useConnectionStatus() {
  const state = useWebSocketStore((s) => s.connection?.state ?? 'disconnected');
  const latency = useWebSocketStore((s) => s.connection?.latency ?? null);
  const channels = useWebSocketStore((s) => s.connection?.channels ?? []);
  const attempts = useWebSocketStore((s) => s.connection?.reconnectAttempts ?? 0);

  return {
    state,
    latency,
    channels,
    attempts,
    isHealthy: state === 'connected',
    isConnecting: state === 'connecting' || state === 'reconnecting',
    isError: state === 'error',
  };
}

// ------------------------------------------------------------------
// Hook: notification badge count
// ------------------------------------------------------------------
export function useNotificationCount() {
  return useWebSocketStore((s) => s.getUnreadCount());
}