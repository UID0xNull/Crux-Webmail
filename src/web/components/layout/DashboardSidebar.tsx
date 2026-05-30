'use client';

import React, { useState, useMemo } from 'react';
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
import { useRouter, usePathname } from 'next/navigation';
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
  const [hoveredMailbox, setHoveredMailbox] = useState<string | null>(null);
  const [hoveredBottomItem, setHoveredBottomItem] = useState<string | null>(null);
  const mailboxes = useMailStore((s) => s.mailboxes);
  const selectedMailbox = useMailStore((s) => s.selectedMailbox);
  const setMailbox = useMailStore((s) => s.setMailbox);
  const loadMailboxes = useMailStore((s) => s.loadMailboxes);
  const logout = useAuthStore((s) => s.logout);
  const notificationCount = useNotificationCount();
  const router = useRouter();
  const pathname = usePathname();

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
  const { special: specialMailboxes, regular: regularMailboxes } = useMemo(() => {
    const special: Mailbox[] = [];
    const regular: Mailbox[] = [];

    for (const mb of mailboxes) {
      if (MAILBOX_ICONS[mb.id]) {
        special.push(mb);
      } else {
        regular.push(mb);
      }
    }
    return { special, regular };
  }, [mailboxes]);

  const isMailboxActive = (mb: Mailbox): boolean => {
    if (selectedMailbox === mb.id) {
      return true;
    }
    // Check if we're in a child route of this mailbox
    if (mb.role === '$inbox' && pathname?.startsWith('/dashboard/inbox')) {
      return true;
    }
    if (mb.role === '$sent' && pathname?.startsWith('/dashboard/sent')) {
      return true;
    }
    if (mb.role === '$drafts' && pathname?.startsWith('/dashboard/drafts')) {
      return true;
    }
    if (mb.role === '$trash' && pathname?.startsWith('/dashboard/trash')) {
      return true;
    }
    if (mb.role === '$junk' && pathname?.startsWith('/dashboard/junk')) {
      return true;
    }
    if (mb.role === '$archive' && pathname?.startsWith('/dashboard/archive')) {
      return true;
    }
    if (mb.role === '$starred' && pathname?.startsWith('/dashboard/starred')) {
      return true;
    }
    return false;
  };

  const renderMailboxItem = (mb: Mailbox, depth = 0) => {
    const Icon = MAILBOX_ICONS[mb.id] || DEFAULT_ICON;
    const isActive = isMailboxActive(mb);
    const isExpanded = expandedMailboxes.has(mb.id);
    const hasChildren = mb.childMailboxes && mb.childMailboxes.length > 0;
    const isHovered = hoveredMailbox === mb.id;

    return (
      <div key={mb.id} className="relative">
        <button
          onMouseEnter={() => setHoveredMailbox(mb.id)}
          onMouseLeave={() => setHoveredMailbox(null)}
          onClick={() => {
            setMailbox(mb.id);
            if (hasChildren) {
              toggleExpand(mb.id);
            }
          }}
          className={`
            relative w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl
            text-left group/mailbox
            transition-all duration-300 ease-out
            ${collapsed ? 'justify-center px-2' : ''}
            ${isActive
              ? 'bg-[var(--crux-accent-main)]/[0.08] text-[var(--crux-accent-main)]'
              : isHovered
                ? 'bg-[var(--crux-base-200)]/[0.3] dark:bg-[var(--crux-base-700)]/[0.3] text-[var(--crux-text-main)]'
                : 'text-[var(--crux-text-muted)] hover:text-[var(--crux-text-main)]'
            }
          `}
        >
          {/* Active position indicator - minimalist line */}
          <span
            className={`
              absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full
              bg-[var(--crux-accent-main)]
              transition-all duration-400 ease-out
              ${isActive ? 'h-5 opacity-100' : 'h-0 opacity-0'}
            `}
          />

          {/* Icon with smooth scale transition */}
          <span
            className={`
              relative z-10 flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
              transition-all duration-300 ease-out
              ${isActive
                ? 'text-[var(--crux-accent-main)]'
                : isHovered
                  ? 'text-[var(--crux-accent-main)] scale-110'
                  : 'text-[var(--crux-text-muted)] group-hover/mailbox:text-[var(--crux-text-main)]'
              }
            `}
          >
            <Icon className="w-[16px] h-[16px]" />
          </span>

          {/* Label with slide-in animation */}
          <span
            className={`
              relative z-10 flex-1 truncate text-[13px] font-medium
              transition-all duration-300 ease-out
              ${isActive
                ? 'font-semibold text-[var(--crux-text-main)]'
                : 'text-[var(--crux-text-muted)] group-hover/mailbox:text-[var(--crux-text-main)]'
              }
            `}
          >
            {mb.role === '$inbox' ? 'Inbox'
             : mb.role === '$sent' ? 'Sent'
             : mb.role === '$drafts' ? 'Drafts'
             : mb.role === '$trash' ? 'Trash'
             : mb.role === '$junk' ? 'Spam'
             : mb.role === '$archive' ? 'Archive'
             : mb.role === '$starred' ? 'Starred'
             : mb.name}
          </span>

          {/* Unseen count badge */}
          {!collapsed && mb.unseenMessages && mb.unseenMessages > 0 && (
            <span className="relative z-10 inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--crux-accent-main)] text-white min-w-[18px] tabular-nums">
              {mb.unseenMessages > 99 ? '99+' : mb.unseenMessages}
            </span>
          )}

          {/* Expand/Collapse chevron */}
          {hasChildren && (
            <span
              className={`
                relative z-10 flex-shrink-0 w-5 flex items-center justify-center
                transition-all duration-300 ease-out
                ${isActive ? 'opacity-100' : isHovered ? 'opacity-100' : 'opacity-0'}
              `}
            >
              {isExpanded
                ? <ChevronDown className="w-3 h-3 text-[var(--crux-text-dim)]" />
                : <ChevronRight className="w-3 h-3 text-[var(--crux-text-dim)]" />
              }
            </span>
          )}
        </button>

        {/* Render children recursively */}
        {isExpanded && hasChildren && mb.childMailboxes && (
          <div className="ml-3 mt-0.5 space-y-0.5">
            {mb.childMailboxes.map((childId) => {
              const child = mailboxes.find((m) => m.id === childId);
              if (!child) {
                return null;
              }
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
        h-full bg-[var(--crux-base-50)] dark:bg-[var(--crux-base-800)] border-r border-[var(--crux-base-200)] dark:border-[var(--crux-base-700)]
        flex flex-col transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[var(--crux-layout-sidebar-collapsed)]' : 'w-[var(--crux-layout-sidebar-width)]'}
      `}
    >
      {/* Toggle button */}
      <div className="p-2 flex-shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`
            w-full flex items-center justify-center p-2 rounded-xl
            text-[var(--crux-text-muted)] hover:text-[var(--crux-accent-main)]
            hover:bg-[var(--crux-base-200)]/[0.5] dark:hover:bg-[var(--crux-base-700)]/[0.5]
            transition-all duration-300 ease-out
          `}
        >
          <div
            className={`
              transition-all duration-300 ease-out
              ${collapsed ? 'rotate-180' : 'rotate-0'}
            `}
          >
            {collapsed
              ? <PanelLeftOpen className="w-4 h-4" />
              : <PanelLeftClose className="w-4 h-4" />
            }
          </div>
        </button>
      </div>

      {/* Mailboxes list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {specialMailboxes.map((mb) => renderMailboxItem(mb))}

        {!collapsed && mailboxes.length > 0 && (
          <div className="border-t border-[var(--crux-base-200)] dark:border-[var(--crux-base-700)] my-3" />
        )}

        {regularMailboxes.map((mb) => renderMailboxItem(mb))}
      </div>

      {/* Bottom actions */}
      <div className="p-2 border-t border-[var(--crux-base-200)]/[0.6] dark:border-[var(--crux-base-700)]/[0.6] space-y-0.5">
        {isAdmin && (
          <button
            onClick={() => router.push('/dashboard/admin')}
            onMouseEnter={() => setHoveredBottomItem('admin')}
            onMouseLeave={() => setHoveredBottomItem(null)}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl
              transition-all duration-300 ease-out relative
              ${collapsed ? 'justify-center px-2' : ''}
              ${pathname?.startsWith('/dashboard/admin')
                ? 'text-amber-500 bg-amber-500/[0.08] dark:bg-amber-500/[0.10]'
                : 'text-[var(--crux-text-muted)] hover:text-amber-500 hover:bg-amber-500/[0.05]'
              }
            `}
          >
            <span className="relative z-10 transition-all duration-300 group-hover/btn:scale-110">
              <Settings className="w-[16px] h-[16px]" />
            </span>
            {!collapsed && <span className="flex-1 text-left text-[13px] font-medium">Admin</span>}
          </button>
        )}

        {/* Notifications */}
        <button
          onMouseEnter={() => setHoveredBottomItem('notifications')}
          onMouseLeave={() => setHoveredBottomItem(null)}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl
            transition-all duration-300 ease-out relative
            ${collapsed ? 'justify-center px-2' : ''}
            ${hoveredBottomItem === 'notifications'
              ? 'bg-[var(--crux-base-200)]/[0.3] dark:bg-[var(--crux-base-700)]/[0.3] text-[var(--crux-text-main)]'
              : 'text-[var(--crux-text-muted)] hover:text-[var(--crux-text-main)]'
            }
          `}
        >
          <span className="relative z-10 transition-all duration-300 group-hover/btn:scale-110">
            <Bell className="w-[16px] h-[16px]" />
          </span>
          {!collapsed && <span className="flex-1 text-left text-[13px] font-medium">Notifications</span>}
          {notificationCount > 0 && (
            <span className="relative z-10 inline-flex items-center justify-center text-[9px] font-bold bg-[var(--crux-semantic-danger)] text-white w-4 h-4 rounded-full">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </button>

        {/* Settings */}
        <button
          onMouseEnter={() => setHoveredBottomItem('settings')}
          onMouseLeave={() => setHoveredBottomItem(null)}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl
            transition-all duration-300 ease-out relative
            ${collapsed ? 'justify-center px-2' : ''}
            ${hoveredBottomItem === 'settings'
              ? 'bg-[var(--crux-base-200)]/[0.3] dark:bg-[var(--crux-base-700)]/[0.3] text-[var(--crux-text-main)]'
              : 'text-[var(--crux-text-muted)] hover:text-[var(--crux-text-main)]'
            }
          `}
        >
          <span className="relative z-10 transition-all duration-300 group-hover/btn:scale-110">
            <Settings className="w-[16px] h-[16px]" />
          </span>
          {!collapsed && <span className="flex-1 text-left text-[13px] font-medium">Settings</span>}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          onMouseEnter={() => setHoveredBottomItem('logout')}
          onMouseLeave={() => setHoveredBottomItem(null)}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl
            transition-all duration-300 ease-out relative
            ${collapsed ? 'justify-center px-2' : ''}
            ${hoveredBottomItem === 'logout'
              ? 'text-[var(--crux-semantic-danger)] bg-[var(--crux-semantic-danger)]/[0.06]'
              : 'text-[var(--crux-text-muted)] hover:text-[var(--crux-semantic-danger)]'
            }
          `}
        >
          <span className="relative z-10 transition-all duration-300 group-hover/btn:scale-110">
            <LogOut className="w-[16px] h-[16px]" />
          </span>
          {!collapsed && <span className="flex-1 text-left text-[13px] font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
}