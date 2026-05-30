'use client';

import React, { useState } from 'react';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertTriangle,
  Archive,
  Star,
  RefreshCcw,
  Bell,
  Search,
  FolderOpen,
} from 'lucide-react';
import { useMailStore } from '@/lib/store/mail';
import MessageSearchBar from '@/email/MessageSearchBar';

export interface TopBarProps {
  notificationCount?: number;
  onRefresh?: () => void;
}

export function DashboardTopBar({ notificationCount = 0, onRefresh }: TopBarProps) {
  const selectedMailbox = useMailStore((s) => s.selectedMailbox);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const mailboxLabel = selectedMailbox === '$inbox' 
    ? 'Bandeja de entrada' 
    : (selectedMailbox as string).replace('

export default DashboardTopBar;, '';

  const handleRefresh = async () => {
    if (isRefreshing || !onRefresh) return;
    setIsRefreshing(true);
    await onRefresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const getActiveMailboxIcon = () => {
    if (selectedMailbox === '$inbox') return Inbox;
    if (selectedMailbox === '$sent') return Send;
    if (selectedMailbox === '$drafts') return FileText;
    if (selectedMailbox === '$trash') return Trash2;
    if (selectedMailbox === '$junk') return AlertTriangle;
    if (selectedMailbox === '$archive') return Archive;
    if (selectedMailbox === '$starred') return Star;
    return FolderOpen;
  };

  const ActiveIcon = getActiveMailboxIcon();

  return (
    <header className="relative flex items-center justify-between px-6 py-4 gap-6 bg-[var(--crux-base-100)]/80 dark:bg-[var(--crux-base-800)]/80 backdrop-blur-xl border-b border-[var(--crux-base-200)]/60 dark:border-[var(--crux-base-700)]/60 overflow-hidden">
      {/* Ambient glow effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--crux-accent-main)]/5 via-transparent to-[var(--crux-accent-secondary)]/5 opacity-50 pointer-events-none" />
      
      {/* Active mailbox indicator */}
      <div className="flex items-center gap-3 min-w-0 relative z-10">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--crux-accent-main)]/20 to-[var(--crux-accent-secondary)]/20 text-[var(--crux-accent-main)] shadow-[0_4px_12px_var(--crux-accent-glow)] border border-[var(--crux-accent-main)]/10">
          <ActiveIcon className="w-[18px] h-[18px] transition-all duration-500 animate-in fade-in scale-in" />
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-gradient-to-r from-[var(--crux-accent-main)] to-[var(--crux-accent-secondary)] border-2 border-[var(--crux-base-100)] dark:border-[var(--crux-base-800)] shadow-[0_0_8px_var(--crux-accent-glow)]" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-semibold text-[var(--crux-text-dim)] uppercase tracking-[0.15em]">Carpeta actual</span>
          <h1 className="font-bold text-lg leading-tight select-none text-[var(--crux-text-main)] truncate transition-all duration-300">
            {mailboxLabel}
          </h1>
        </div>
        {/* Active position indicator */}
        <div className="hidden sm:flex items-center gap-1 ml-2">
          <span className="w-1 h-4 rounded-full bg-gradient-to-b from-[var(--crux-accent-main)] to-[var(--crux-accent-secondary)] animate-pulse" />
        </div>
      </div>

      {/* Search bar */}
      <div className="flex-1 max-w-2xl relative z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--crux-text-dim)] transition-colors duration-200" />
          <MessageSearchBar />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 relative z-10">
        {onRefresh && (
          <button 
            onClick={handleRefresh} 
            title="Refrescar"
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl text-[var(--crux-text-muted)] hover:text-[var(--crux-text-main)] hover:bg-white/10 dark:hover:bg-white/[0.05] transition-all duration-200 hover:shadow-sm group/btn disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-[var(--crux-base-200)]/50"
          >
            <RefreshCcw className={`w-[16px] h-[16px] transition-all duration-500 ${isRefreshing ? 'animate-spin' : 'group-hover/btn:rotate-180'}`} />
            <span className="text-[13px] hidden sm:inline">Actualizar</span>
          </button>
        )}

        {notificationCount > 0 && (
          <div className="relative group/notify">
            <span className="flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-gradient-to-r from-[var(--crux-semantic-danger)] to-[var(--crux-semantic-danger)]/80 text-white shadow-[0_4px_12px_var(--crux-semantic-danger-glow)] animate-in fade-in slide-in-from-right-2 cursor-pointer hover:scale-105 transition-transform duration-200">
              <Bell className="w-3 h-3" />
              {notificationCount > 99 ? '99+' : notificationCount}
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white/30 animate-ping" />
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

export default DashboardTopBar;