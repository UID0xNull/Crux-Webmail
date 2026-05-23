'use client';

import React, { useState } from 'react';
import { useMailStore } from '@/lib/store/mail';
import { useAuthStore } from '@/lib/store/auth';
import { DESIGN_TOKENS } from '@/lib/design-token';
import type { Mailbox } from '@/types/mail';
import { useRouter } from 'next/navigation';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertTriangle,
  Archive,
  Star,
  Settings,
  LogOut,
} from 'lucide-react';

const MAILBOX_ICONS: Record<string, React.ElementType> = {
  $inbox: Inbox,
  $sent: Send,
  $drafts: FileText,
  $trash: Trash2,
  $junk: AlertTriangle,
  $archive: Archive,
  $starred: Star,
};

function MailboxItem({ mb }: { mb: Mailbox }) {
  const selectedMailbox = useMailStore((s) => s.selectedMailbox);
  const setMailbox = useMailStore((s) => s.setMailbox);
  const isSelected = selectedMailbox === mb.id;
  const Icon = MAILBOX_ICONS[mb.id] || Archive;

  return (
    <button
      onClick={() => setMailbox(mb.id)}
      className={`flex items-center gap-2 w-full text-sm font-medium rounded-xl px-3 py-2.5 transition-all duration-200 ease-in-out border ${isSelected ? 'shadow-sm' : ''} `}
              style={{ 
          borderWidth: '1px',
          background: isSelected ? DESIGN_TOKENS.colors.accentLighter : 'transparent',
          borderColor: isSelected ? DESIGN_TOKENS.colors.primaryLighter : 'transparent',
          color: isSelected ? DESIGN_TOKENS.colors.textPrimary : DESIGN_TOKENS.colors.textSecondary,
        }}
      <Icon size={18} className={`transition-colors duration-200 ease-in-out ${isSelected ? 'text-[var(--primary)]' : 'text-slate-400'}`} />
      <span className="truncate">{mb.name || mb.id}</span>
    </button>
  );
}

export function DashboardSidebar() {
  const mailboxes = useMailStore((s) => s.mailboxes);
  const loadMailboxes = useMailStore((s) => s.loadMailboxes);
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = useAuthStore(
    (s) => Array.isArray(s.user?.roles) && s.user.roles.includes('admin')
  );
  const router = useRouter();

  React.useEffect(() => { loadMailboxes(); }, [loadMailboxes]);

  const special: Mailbox[] = [];
  const regular: Mailbox[] = [];
  for (const mb of mailboxes) {
    MAILBOX_ICONS[mb.id] ? special.push(mb) : regular.push(mb);
  }

  return (
    <nav className="h-full w-64 flex flex-col border-r" style={{ background: COLORS.bgSubtle, borderColor: COLORS.borderColorMuted }}>
      <header className="px-5 py-3.5 flex items-center">
        <span className="font-bold text-lg leading-tight select-none" style={{ color: COLORS.primary }}>Crux Webmail</span>
      </header>

      <div className="flex-1 overflow-y-auto pt-2 px-2 space-y-1.5">
        {special.map(mb => (
          <MailboxItem key={mb.id} mb={mb} />
        ))}

        {regular.length > 0 && (
          <>
            <hr className="my-4" style={{ borderColor: COLORS.borderColorMuted }} />
            {regular.map(mb => (
              <MailboxItem key={mb.id} mb={mb} />
            ))}
          </>
        )}
      </div>

      <footer className="border-t p-3 flex items-center justify-end gap-2" style={{ borderColor: COLORS.borderColorMuted }}>
        {isAdmin && (
          <button onClick={() => router.push('/admin')} title="Administrar" 
            className="p-1.5 rounded-lg text-slate-500 hover:text-[var(--primary)] transition-colors duration-200 ease-in-out">
            <Settings size={18} />
          </button>
        )}
        <button onClick={() => logout()} title="Cerrar sesión" 
          className="p-1.5 rounded-lg text-red-600 hover:text-red-700 transition-colors duration-200 ease-in-out">
          <LogOut size={24} />
        </button>
      </footer>
    </nav>
  );
}

export default DashboardSidebar;