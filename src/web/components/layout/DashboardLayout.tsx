'use client';

import { usePathname, useRouter } from 'next/navigation';
import { DashboardSidebar } from './DashboardSidebar';
import { Search, Mail, Settings, AlertCircle, Wifi, WifiOff, RefreshCw, ChevronLeft } from 'lucide-react';
import { useConnectionStatus, useRealTimeEvents } from '../../hooks/useWebSocket';
import { useAuthStore } from '../../lib/store/auth';
import { useMailStore } from '../../lib/store/mail';
import { useEffect, useState } from 'react';
import { hydrateAuth } from '../../lib/store/auth';
import { useNotificationCount } from '../../hooks/useWebSocket';
import { formatDistanceToNow } from 'date-fns';

// ------------------------------------------------------------------
// Dashboard Layout - wraps all /dashboard/* routes
// ------------------------------------------------------------------
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const { state: wsState, isHealthy, isConnecting, isError } = useConnectionStatus();
  const notificationCount = useNotificationCount();
  const refreshInbox = useMailStore((s) => s.refreshInbox);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hydrateAuth().then((valid) => {
      if (cancelled) return;
      setAuthChecked(true);
      if (!valid && !isLoading) {
        router.replace('/login');
      }
    });
    return () => { cancelled = true; };
  }, [router, isLoading]);

  // Subscribe to real-time events
  useRealTimeEvents({
    onNewMessage: () => {
      refreshInbox();
    },
    onFlagChanged: () => {
      refreshInbox();
    },
    onDeleted: () => {
      refreshInbox();
    },
    onSyncStatus: (data) => {
      if ((data as any)?.status === 'idle') {
        refreshInbox();
      }
    },
  });

  // Loading state
  if (!authChecked || isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading Crux Webmail...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100 dark:bg-gray-950">
      {/* Sidebar */}
      <DashboardSidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <DashboardTopBar
          user={user}
          wsState={wsState}
          isHealthy={isHealthy}
          isConnecting={isConnecting}
          isError={isError}
          notificationCount={notificationCount}
          onRefresh={refreshInbox}
        />

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------
// Top Bar Component
// ------------------------------------------------------------------
interface DashboardTopBarProps {
  user: any;
  wsState: string;
  isHealthy: boolean;
  isConnecting: boolean;
  isError: boolean;
  notificationCount: number;
  onRefresh: () => void;
}

function DashboardTopBar({
  wsState,
  isHealthy,
  isConnecting,
  isError,
  notificationCount,
  onRefresh,
}: DashboardTopBarProps) {
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
      {/* Left: breadcrumbs + refresh */}
      <div className="flex items-center gap-3">
        <button
          onClick={onRefresh}
          className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Right: connection status + notifications + user */}
      <div className="flex items-center gap-3">
        {/* Connection indicator */}
        <div
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
            transition-colors
          `}
          title={`Connection: ${wsState}`}
        >
          {isHealthy ? (
            <>
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-green-600 dark:text-green-400">Connected</span>
            </>
          ) : isConnecting ? (
            <>
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              <span className="text-yellow-600 dark:text-yellow-400">Connecting...</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-red-600 dark:text-red-400">Disconnected</span>
            </>
          )}
        </div>

        {/* Notification badge */}
        {notificationCount > 0 && (
          <div className="relative">
            <BellIcon className="w-5 h-5 text-gray-500" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {notificationCount}
            </span>
          </div>
        )}

        {/* User avatar */}
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
          {user?.display_name?.[0]?.toUpperCase() ?? 'U'}
        </div>
      </div>
    </header>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}
---CODE---