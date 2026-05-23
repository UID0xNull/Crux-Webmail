'use client';

import React, { useMemo } from 'react';
import {
  Inbox as InboxIcon, Send, FileText, Trash2, AlertTriangle, Archive, Star, Settings, LogOut,
} from 'lucide-react';
import { useMailStore } from '@/lib/store/mail';
import { useAuthStore } from '@/lib/store/auth';
import { useRouter, usePathname } from 'next/navigation';
import type { Mailbox } from '@/types';
import { COLORS, RADIUS, SHADOWS, SPACING } from '@/design-tokens';

const MAILBOX_ICONS: Record<string, React.ElementType> = {
  $inbox: InboxIcon,
  $sent: Send,
  $drafts: FileText,
  $trash: Trash2,
  $junk: AlertTriangle,
  $archive: Archive,
  $starred: Star,
};

function mailboxIsSelected(path?: string) {
  if (!path) return false;
  const [, , folder] = path.split('/');
  return !!MAILBOX_ICONS[`$${folder}`];
}

export interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}

function MailboxItem({ mb }: { mb: Mailbox }) {
  const selectedMailbox = useMailStore(s => s.selectedMailbox);
  const setMailbox = useMailStore(s => s.setMailbox);
  const isSelected = selectedMailbox === mb.id;
  const Icon = MAILBOX_ICONS[mb.id] || Archive;

  return (
    <button
      onClick={() => setMailbox(mb.id)}
      className="flex items-center gap-2 w-full text-sm font-medium rounded-lg px-3 py-2 transition-colors duration-200 ease-in-out"
      style={{ 
        color: isSelected ? COLORS.primary : '#64748B',
        background: isSelected ? COLORS.primarySubtle : 'transparent',
        borderRadius: RADIUS.md,
        borderColor: 'transparent' as const,
        boxShadow: isSelected ? `0 1px 2px -1px rgba(0,0,0,.05)` : undefined,
      }}
    >
      {React.createElement(Icon, { size: 18 })}
      <span>{mb.name || mb.id}</span>
    </button>
  );
}

function SidebarFooter({ sidebarOpen, setSidebarOpen, logout, isAdmin, router, pathname }: SidebarProps & { logout(): void; isAdmin?: boolean; router: ReturnType<typeof useRouter>; pathname: string | null }) {
  return (
    <div 
      className="p-2 flex items-center justify-end gap-x-1"
      style={{
        borderTopWidth: '1px',
        borderColor: '#E2E8F0',
        backgroundColor: COLORS.bgCard,
      }}
    >
      {isAdmin && (
        <button 
          onClick={() => router.push('/admin')} 
          title="Administrar" 
          className="p-1.5 rounded-lg transition-colors duration-200 ease-in-out"
          style={{ borderRadius: RADIUS.md, color: '#64748B' }}
        >
          <Settings size={18} />
        </button>
      )}

      {mailboxIsSelected(pathname) && (
        <button