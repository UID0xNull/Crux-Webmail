'use client';

import React, { useState } from 'react';
import { useMailStore } from 'lib/store/mail';
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  AlertTriangle,
  Archive,
  Star,
  ChevronDown,
  ChevronRight,
  Bell,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuthStore } from 'lib/store/auth';
import { useRouter } from 'next/navigation';
import { useNotificationCount } from 'hooks/useWebSocket';
import type { Mailbox } from 'lib/types';

// ------------------------------------------------------------------
// Mailbox icon mapping
// ------------------------------------------------------------------
const MAILBOX_ICONS: Record<string, React.ElementType> = {
  $inbox: Inbox,
  $sent: Send,
  $drafts: FileText,
  $trash: Trash2,
  $junk: AlertTriangle,
  $archive: Archive,
  $starred: Star,
};

const DEFAULT_ICON = Archive;

// ------------------------------------------------------------------
// Sidebar Component
// ------------------------------------------------------------------
export function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedMailboxes, setExpandedMailboxes] = useState<Set<string>>(new Set(['$inbox']));
  const mailboxes = useMailStore((s) => s.mailboxes);
  const selectedMailbox = useMailStore((s) => s.selectedMailbox);
  const setMailbox = useMailStore((s) => s.setMailbox);
  const loadMailboxes = useMailStore((s) => s.loadMailboxes);
  const logout = useAuthStore((s) => s.logout);
  const notificationCount = useNotificationCount();
  const router = useRouter();

  React.useEffect(() => {
    loadMailboxes();
  }, [loadMailboxes]);

  // Check if current user is admin (for admin panel link)
  const isAdmin = useAuthStore(
    (s) => Array.isArray(s.user?.roles) && s.user.roles.includes('admin')
  );

  const toggleExpand = (mailboxId: string) => {
    setExpandedMailboxes((prev) => {
      const next = new Set(prev);
      if (next.has(mailboxId)) {
        next.delete(mailboxId);
      } else {
        next.add(mailboxId);
      }
      return next;
    });
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  // Group mailboxes: special ones first, then rest
  const specialMailboxes: Mailbox[] = [];
  const regularMailboxes: Mailbox[] = [];

  for (const mb of mailboxes) {
    if (MAILBOX_ICONS[mb.id]) {
      specialMailboxes.push(mb);
    } else {
      regularMailboxes.push(mb);
    }
  }

  const renderMailboxItem = (mb: Mailbox, depth = 0) => {
    const Icon = MAILBOX_ICONS[mb.id] || DEFAULT_ICON;
    const isSelected = selectedMailbox === mb.id;
    const isExpanded = expandedMailboxes.has(mb.id);
    const hasChildren = mb.childMailboxes && mb.childMailboxes.length > 0;

    return (
      <div key={mb.id}>
        <button
          onClick={() => {
            setMailbox(mb.id);
            if (hasChildren) toggleExpand(mb.id);
          }}
          className={`
            w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg
            transition-colors text-left group
            ${isSelected
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }
          `}
          style={{ paddingLeft: `${depth * 12 + 12}px` }}
        >
          {/* Expand/Collapse chevron if has children */}
          <span className="w-4 flex-shrink-0">
            {hasChildren && (
              isExpanded
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />
            )}
          </span>

          <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? '' : 'text-gray-400'}`} />

          {!collapsed && (
            <span className="flex-1 truncate">
              {mb.role === '$inbox' ? 'Inbox'
               : mb.role === '$sent' ? 'Sent'
               : mb.role === '$drafts' ? 'Drafts'
               : mb.role === '$trash' ? 'Trash'
               : mb.role === '$junk' ? 'Spam'
               : mb.role === '$archive' ? 'Archive'
               : mb.role === '$starred' ? 'Starred'
               : mb.name}
            </span>
          )}

          {/* Unseen count badge */}
          {!collapsed && mb.unseenMessages && mb.unseenMessages > 0 && (
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
              isSelected
                ? 'bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-100'
                : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {mb.unseenMessages}
            </span>
          )}
        </button>

        {/* Render children recursively */}
        {isExpanded && hasChildren && mb.childMailboxes && (
          <div>
            {mb.childMailboxes.map((childId) => {
              const child = mailboxes.find((m) => m.id === childId);
              if (!child) return null;
              return renderMailboxItem(child, depth + 1);
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`
        h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700
        flex flex-col transition-all duration-200
        ${collapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Toggle button */}
      <div className="p-2 flex-shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
        >
          {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
      </div>

      {/* Mailboxes list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {specialMailboxes.map((mb) => renderMailboxItem(mb))}

        {!collapsed && mailboxes.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
        )}

        {regularMailboxes.map((mb) => renderMailboxItem(mb))}
      </div>

      {/* Bottom: admin + notifications + settings + logout */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-700 space-y-1">
        {isAdmin && (
          <button
            onClick={() => router.push('/dashboard/admin')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30"
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {!collapsed && (
              <span className="flex-1 text-left">Admin</span>
            )}
          </button>
        )}

        {/* Notifications button */}
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <Bell className="w-4 h-4 flex-shrink-0" />
          {!collapsed && (
            <span className="flex-1 text-left">Notifications</span>
          )}
          {notificationCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center">
              {notificationCount}
            </span>
          )}
        </button>

        {/* Settings button */}
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="flex-1 text-left">Settings</span>}
        </button>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="flex-1 text-left">Logout</span>}
        </button>
      </div>
    </aside>
  );
}