'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMailStore } from '../../../lib/store/mail';
import { MessageListSkeleton } from '../../../components/ui/skeleton';
import { Badge } from '../../../components/ui/badge';
import { MailOpen, Star, Paperclip, AlertTriangle, Filter, Search, ArrowUpDown } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import type { EmailMessage } from '../../../lib/types';

// ------------------------------------------------------------------
// Inbox View - Message List with virtualized rendering
// ------------------------------------------------------------------
export default function InboxPage() {
  const router = useRouter();
  const messages = useMailStore((s) => s.messages);
  const isLoading = useMailStore((s) => s.isLoading);
  const hasMore = useMailStore((s) => s.hasMore);
  const selectedMailbox = useMailStore((s) => s.selectedMailbox);
  const loadInbox = useMailStore((s) => s.loadInbox);
  const loadMore = useMailStore((s) => s.loadMore);
  const markAsRead = useMailStore((s) => s.markAsRead);

  const observerTarget = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  // Infinite scroll observer
  useEffect(() => {
    if (!observerTarget.current || !hasMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  const handleSelectMessage = useCallback(
    (msg: EmailMessage) => {
      // Mark as read if not already
      if (!msg.isSeen) {
        markAsRead(msg.id, true);
      }
      router.push(`/dashboard/message/${msg.id}`);
    },
    [router, markAsRead]
  );

  const toggleFlag = useCallback(
    (e: React.MouseEvent, msg: EmailMessage) => {
      e.stopPropagation();
      markAsRead(msg.id, !msg.isFlagged);
    },
    [markAsRead]
  );

  // Mailbox label
  const mailboxLabel = selectedMailbox === '$inbox' ? 'Inbox'
    : selectedMailbox === '$sent' ? 'Sent'
    : selectedMailbox === '$drafts' ? 'Drafts'
    : selectedMailbox === '$trash' ? 'Trash'
    : selectedMailbox === '$junk' ? 'Spam'
    : selectedMailbox;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{mailboxLabel}</h1>
            <Badge variant="info">
              {messages.length} {messages.length === 1 ? 'message' : 'messages'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search in {mailbox}..."
                className="pl-9 pr-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
            <button className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500" title="Filter">
              <Filter className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500" title="Sort">
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
        {isLoading && messages.length === 0 ? (
          <MessageListSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
            <MailOpen className="w-12 h-12" />
            <p className="text-lg">No messages in {mailboxLabel}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {messages.map((msg) => (
              <MessageRow
                key={msg.id}
                message={msg}
                onClick={() => handleSelectMessage(msg)}
                onToggleFlag={toggleFlag}
              />
            ))}
          </div>
        )}

        {/* Load more trigger */}
        <div ref={observerTarget} className="h-4" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Individual Message Row
// ------------------------------------------------------------------
function MessageRow({
  message,
  onClick,
  onToggleFlag,
}: {
  message: EmailMessage;
  onClick: () => void;
  onToggleFlag: (e: React.MouseEvent, msg: EmailMessage) => void;
}) {
  const sender = message.from[0] ?? { name: 'Unknown', email: 'unknown' };

  return (
    <div
      onClick={onClick}
      className={`
        group flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-750
        transition-colors cursor-pointer
        ${!message.isSeen ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}
      `}
    >
      {/* Star / Flag */}
      <button
        onClick={(e) => onToggleFlag(e, message)}
        className="mt-1 flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      >
        <Star
          className={`w-4 h-4 ${
            message.isFlagged
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-gray-300 dark:text-gray-600 group-hover:text-gray-400'
          }`}
        />
      </button>

      {/* Sender Avatar */}
      <div
        className={`
          w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold
          ${!message.isSeen
            ? 'bg-blue-500 text-white'
            : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
          }
        `}
      >
        {sender.name?.[0]?.toUpperCase() ?? sender.email?.[0]?.toUpperCase() ?? '?'}
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span
            className={`text-sm truncate ${
              !message.isSeen
                ? 'font-bold text-gray-900 dark:text-gray-100'
                : 'font-medium text-gray-700 dark:text-gray-300'
            }`}
          >
            {sender.name || sender.email}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {message.date ? formatDistanceToNow(parseISO(message.date), { addSuffix: true }) : ''}
          </span>
        </div>

        <div
          className={`text-sm truncate mb-0.5 ${
            !message.isSeen
              ? 'font-semibold text-gray-800 dark:text-gray-200'
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          {message.subject || '(No Subject)'}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
          {message.previewText || '(No preview)'}
        </p>
      </div>

      {/* Indicators */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {/* Attachment indicator */}
        {message.hasAttachments && (
          <Paperclip className="w-3.5 h-3.5 text-gray-400" />
        )}

        {/* Encryption/Signature */}
        {message.isEncrypted && (
          <Badge variant="success" className="text-[10px] px-1 py-0">🔒</Badge>
        )}
        {message.quarantine_status === 'suspicious' && (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        )}

        {/* Quarantine */}
        {message.quarantine_status === 'quarantined' && (
          <Badge variant="error" className="text-[10px] px-1 py-0">Quarantined</Badge>
        )}
      </div>
    </div>
  );
}
---CODE---