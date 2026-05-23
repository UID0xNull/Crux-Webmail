'use client';

import React from 'react';
import { Inbox, RefreshCcw } from 'lucide-react';
import { useMailStore } from '@/lib/store/mail';
import MessageSearchBar from '@/email/MessageSearchBar';
import { COLORS, RADIUS } from '@/design-tokens';

export interface TopBarProps {
  notificationCount?: number;
  onRefresh?: () => void;
}

export function DashboardTopBar({ notificationCount = 0, onRefresh }: TopBarProps) {
  const selectedMailbox = useMailStore((s) => s.selectedMailbox);

  return (
    <header 
      className="flex items-center px-4 py-3 gap-6"
      style={{ 
        borderBottom: '1px solid #E2E8F0',
        backgroundColor: COLORS.bgCard,
      }}
    >
      <div className="flex items-center gap-2">
        <Inbox size={20} />
        <h1 
          className="font-semibold text-xl leading-tight select-none"
          style={{ color: COLORS.primary }}
        >
          {selectedMailbox === '$inbox' ? 'Bandeja de entrada' : (selectedMailbox as string).replace('$', '')}
        </h1>
      </div>

      <MessageSearchBar />

      {onRefresh && (
        <button 
          onClick={onRefresh} 
          title="Refrescar"
          className="flex items-center gap-2 px-3 py-1.5 transition-colors duration-200 ease-in-out"
          style={{ borderRadius: RADIUS.md, backgroundColor: '#F1F5F9' }}
        >
          <RefreshCcw size={16} />
        </button>
      )}

      {notificationCount > 0 && (
        <span 
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ 
            borderRadius: '9999px', 
            paddingInline: `${SPACING[2.5]}px`,
            paddingTop: SPACING[2.5] / 4,
            paddingBottom: SPACING[2.5] / 4,
            backgroundColor: COLORS.red,
            color: '#FFFFFF',
          }}
        >
          {notificationCount}
        </span>
      )}
    </header>
  );
}

export default DashboardTopBar;