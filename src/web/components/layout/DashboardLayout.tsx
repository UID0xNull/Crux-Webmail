'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { DashboardSidebar } from './DashboardSidebar';
import { Mail, Settings, RefreshCw, ChevronLeft, Bell, Inbox, Send, FileText, Trash2, Folder, Star } from 'lucide-react';
import { useConnectionStatus, useRealTimeEvents } from '@/hooks/useWebSocket';
import { useAuthStore } from '@/lib/store/auth';
import { useMailStore } from '@/lib/store/mail';
import { useEffect, useState, useMemo } from 'react';
import { hydrateAuth } from '@/lib/store/auth';
import { useNotificationCount } from '@/hooks/useWebSocket';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PerformanceProvider } from '@/components/ui/PerformanceProvider';

// ------------------------------------------------------------------
// Dashboard Layout - wraps all /dashboard/* routes
// ------------------------------------------------------------------
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const { state: wsState, isHealthy, isConnecting } = useConnectionStatus();
  const notificationCount = useNotificationCount();
  const refreshInbox = useMailStore((s) => s.refreshInbox);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hydrateAuth().then((valid) => {
      if (cancelled) {
return;
}
      setAuthChecked(true);
      if (!valid && !isLoading) {
        router.replace('/login');
      }
    });
    return () => {
 cancelled = true; 
};
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
      <div className="h-screen flex items-center justify-center bg-[var(--crux-base-50)] dark:bg-[var(--crux-base-900)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-[var(--crux-accent-main)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[var(--crux-text-muted)]">Loading Crux Webmail...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden bg-[var(--crux-base-100)] dark:bg-[var(--crux-base-950)] relative">
      {/* Subtle noise overlay */}
      <div className="pointer-events-none absolute inset-0 z-[1] opacity-[0.02] mix-blend-overlay" aria-hidden>
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <filter id="noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#noise)" opacity="1" />
        </svg>
      </div>

      {/* App shell — full-width CSS Grid with base padding */}
      <div
        className="
          relative z-[2]
          grid w-full h-full
          grid-cols-[auto_1fr]
          overflow-hidden
          p-[20px]
          gap-[24px]
        "
      >
        {/* Sidebar */}
        <DashboardSidebar />

        {/* Main Content — card-like container */}
        <main
          className="
            flex flex-col overflow-hidden
            bg-white/80 dark:bg-[var(--crux-base-900)]/80
            backdrop-blur-xl
            rounded-[16px]
            shadow-lg dark:shadow-black/40
            border border-[var(--crux-base-200)]/50 dark:border-[var(--crux-base-700)]/50
          "
        >
          {/* Top Bar */}
          <DashboardTopBar
            user={user}
            wsState={wsState}
            isHealthy={isHealthy}
            isConnecting={isConnecting}
            notificationCount={notificationCount}
            onRefresh={refreshInbox}
          />

          {/* Page Content */}
          <PerformanceProvider>
            <ErrorBoundary>
              <div className="flex-1 overflow-auto p-6">
                {children}
              </div>
            </ErrorBoundary>
          </PerformanceProvider>
        </main>
      </div>
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
  notificationCount: number;
  onRefresh: () => void;
}

function DashboardTopBar({
  user,
  wsState,
  isHealthy,
  isConnecting,
  notificationCount,
  onRefresh,
}: DashboardTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Parse breadcrumbs from pathname
  const breadcrumbs = useMemo(() => {
    return pathname?.split('/').filter(Boolean) || [];
  }, [pathname]);

  // Get current mailbox icon component and active label
  const { MailboxIcon, activeLabel } = useMemo(() => {
    if (pathname?.startsWith('/dashboard/inbox')) return { MailboxIcon: Inbox, activeLabel: 'Inbox' };
    if (pathname?.startsWith('/dashboard/sent')) return { MailboxIcon: Send, activeLabel: 'Sent' };
    if (pathname?.startsWith('/dashboard/drafts')) return { MailboxIcon: FileText, activeLabel: 'Drafts' };
    if (pathname?.startsWith('/dashboard/trash')) return { MailboxIcon: Trash2, activeLabel: 'Trash' };
    if (pathname?.startsWith('/dashboard/archive')) return { MailboxIcon: Folder, activeLabel: 'Archive' };
    if (pathname?.startsWith('/dashboard/starred')) return { MailboxIcon: Star, activeLabel: 'Starred' };
    if (pathname?.startsWith('/dashboard/admin')) return { MailboxIcon: Settings, activeLabel: 'Admin' };
    return { MailboxIcon: Mail, activeLabel: 'Mail' };
  }, [pathname]);

  // User avatar initials
  const initials = user?.display_name
    ? user.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <header className="relative bg-white/80 backdrop-blur-sm dark:bg-[var(--crux-base-800)]/80 border-b border-[var(--crux-base-200)] dark:border-[var(--crux-base-700)] px-4 py-2.5 flex items-center justify-between flex-shrink-0 overflow-hidden">
      {/* Animated gradient line at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--crux-accent-main)] to-transparent opacity-50" />

      {/* Left: breadcrumbs + refresh */}
      <div className="flex items-center gap-3 z-10">
        {/* Refresh button */}
        <button
          onClick={onRefresh}
          className="p-2 rounded-xl hover:bg-[var(--crux-base-100)] dark:hover:bg-[var(--crux-base-700)] text-[var(--crux-text-dim)] hover:text-[var(--crux-accent-main)] transition-all duration-300 ease-out hover:shadow-sm hover:shadow-[var(--crux-accent-glow)] group/refresh"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 transition-transform duration-300 group-hover/refresh:rotate-180" />
        </button>

        {/* Current mailbox icon with active position indicator */}
        <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--crux-accent-main)]/[0.08] dark:bg-[var(--crux-accent-main)]/[0.12] border border-[var(--crux-accent-main)]/10 overflow-hidden group/mb">
          {/* Active position indicator */}
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full bg-gradient-to-b from-[var(--crux-accent-main)] to-[var(--crux-accent-secondary)] shadow-[0_0_8px_var(--crux-accent-glow)] animate-pulse" />
          {/* Shimmer on hover */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--crux-accent-main)]/5 to-transparent translate-x-[-100%] group-hover/mb:translate-x-[100%] transition-transform duration-700" />
          <MailboxIcon className="w-4 h-4 text-[var(--crux-accent-main)] relative z-10" />
          <span className="text-xs font-semibold text-[var(--crux-accent-main)] relative z-10">
            {activeLabel}
          </span>
        </div>

        {/* Breadcrumbs */}
        <nav className="hidden sm:flex items-center gap-1.5 text-sm">
          {breadcrumbs.length > 0 && (
            <>
              <ChevronLeft className="w-3 h-3 text-[var(--crux-text-dim)] rotate-180" />
              {breadcrumbs.map((segment, index) => {
                // Skip 'dashboard' prefix for cleaner display
                if (segment === 'dashboard') {
return null;
}

                const isLast = index === breadcrumbs.length - 1;

                return (
                  <div key={index} className="flex items-center">
                    <button
                      onClick={() => router.push('/dashboard/' + breadcrumbs.slice(0, index + 1).join('/'))}
                      className={`
                        flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-300
                        ${isLast
                          ? 'text-[var(--crux-text-main)] bg-[var(--crux-base-100)] dark:bg-[var(--crux-base-700)] shadow-sm'
                          : 'text-[var(--crux-text-muted)] hover:text-[var(--crux-text-main)] hover:bg-[var(--crux-base-100)] dark:hover:bg-[var(--crux-base-700)]'
                        }
                      `}
                    >
                      {isLast && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--crux-accent-main)] animate-pulse" />
                      )}
                      <span className="capitalize">{segment}</span>
                    </button>
                    {index < breadcrumbs.length - 1 && (
                      <ChevronLeft className="w-3 h-3 text-[var(--crux-text-dim)] rotate-180 ml-1" />
                    )}
                  </div>
                );
              })}
            </>
          )}
        </nav>
      </div>

      {/* Right: connection status + notifications + user */}
      <div className="flex items-center gap-3 z-10">
        {/* Connection indicator */}
        <div
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium
            border transition-all duration-300
            ${isHealthy
              ? 'bg-green-50/80 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800'
              : isConnecting
                ? 'bg-yellow-50/80 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800'
                : 'bg-red-50/80 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800'
            }
          `}
          title={`Connection: ${wsState}`}
        >
          <div className={`
            w-2 h-2 rounded-full transition-all duration-300
            ${isHealthy ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}
          `} />
          <span className="hidden sm:inline">{
            isHealthy ? 'Connected'
            : isConnecting ? 'Connecting...'
            : 'Disconnected'
          }</span>
        </div>

        {/* Notification button */}
        <div className="relative group">
          <button className="p-2 rounded-xl hover:bg-[var(--crux-base-100)] dark:hover:bg-[var(--crux-base-700)] text-[var(--crux-text-dim)] hover:text-[var(--crux-accent-main)] transition-all duration-300 hover:shadow-sm">
            <Bell className="w-5 h-5" />
          </button>
          {notificationCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-gradient-to-r from-[var(--crux-semantic-danger)] to-[var(--crux-semantic-danger)]/80 text-white text-[10px] rounded-full flex items-center justify-center font-bold animate-pulse shadow-[0_2px_8px_var(--crux-semantic-danger-glow)]">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-[var(--crux-base-200)] dark:bg-[var(--crux-base-700)]" />

        {/* User avatar with tooltip */}
        <div className="relative group/user">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--crux-accent-main)] to-[var(--crux-accent-secondary)] flex items-center justify-center text-white text-sm font-bold cursor-pointer hover:shadow-lg hover:shadow-[var(--crux-accent-main)]/20 transition-all duration-300 hover:scale-105">
            {initials}
          </div>
          {/* Tooltip */}
          <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[var(--crux-base-800)] rounded-xl shadow-xl border border-[var(--crux-base-200)] dark:border-[var(--crux-base-700)] p-3 opacity-0 invisible group-hover/user:opacity-100 group-hover/user:visible transition-all duration-300 z-50">
            <div className="text-sm font-semibold text-[var(--crux-text-main)]">{user?.display_name || 'User'}</div>
            <div className="text-xs text-[var(--crux-text-muted)] truncate mt-1">{user?.email || ''}</div>
            <div className="text-xs text-[var(--crux-accent-main)] font-medium mt-1">
              {user?.roles?.join(', ') || 'user'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}