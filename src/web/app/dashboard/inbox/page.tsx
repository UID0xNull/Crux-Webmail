'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMailStore } from '@/lib/store/mail';
import { MessageListSkeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { MessageSearchBar } from '@/components/email/MessageSearchBar';
import { MessageFilters } from '@/components/email/MessageFilters';
import { MultiSelectBar } from '@/components/email/MultiSelectBar';
import { MailOpen, Star, Paperclip, AlertTriangle, CheckSquare, Check } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import type { EmailMessage } from '@/lib/types';

const ACCENT_LIGHT = '#5D76ED'; // --crux-accent-light color for inlined use

export default function InboxPage() {
  const router = useRouter();
  const rawMessages = useMailStore((s) => s.messages);
  const isLoading = useMailStore((s) => s.isLoading);
  const hasMore = useMailStore((s) => s.hasMore);
  const selectedMailbox = useMailStore((s) => s.selectedMailbox);
  const loadInbox = useMailStore((s) => s.loadInbox);
  const loadMore = useMailStore((s) => s.loadMore);
  const markAsRead = useMailStore((s) => s.markAsRead);
  const deleteMessage = useMailStore((s) => s.deleteMessage);

  const [filteredMessages, setFilteredMessages] = useState<EmailMessage[]>(rawMessages);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const observerTarget = useRef<HTMLDivElement | null>(null);

  useEffect(() => { loadInbox(); }, [loadInbox]);
  useEffect(() => { setFilteredMessages(rawMessages); }, [rawMessages]);
  useEffect(() => { setSelectedIds(new Set()); setSelectAll(false); }, [selectedMailbox]);

  useEffect(() => {
    if (!observerTarget.current || !hasMore || isLoading) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '200px' }
    );
    observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  const toggleSelectMsg = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectAll) { setSelectedIds(new Set()); setSelectAll(false); }
    else { setSelectedIds(new Set(filteredMessages.map((m) => m.id))); setSelectAll(true); }
  }, [selectAll, filteredMessages]);

  const handleBulkAction = useCallback(async (action: string, ids: string[]) => {
    for (const id of ids) {
      switch (action) {
        case 'markRead': await markAsRead(id, true); break;
        case 'markUnread': await markAsRead(id, false); break;
        case 'toggleFlag': {
          const msg = filteredMessages.find((m) => m.id === id);
          if (msg) await markAsRead(id, !msg.isFlagged);
          break;
        }
        case 'delete': await deleteMessage(id); break;
        case 'archive': await markAsRead(id, true); break;
      }
    }
    setSelectedIds(new Set());
    setSelectAll(false);
  }, [filteredMessages, markAsRead, deleteMessage]);

  const handleSelectMessage = useCallback((msg: EmailMessage) => {
    if (selectedIds.size > 0) { toggleSelectMsg(msg.id, {} as React.MouseEvent); return; }
    if (!msg.isSeen) markAsRead(msg.id, true);
    router.push(`/dashboard/message/${msg.id}`);
  }, [router, markAsRead, selectedIds.size, toggleSelectMsg]);

  const toggleFlag = useCallback((e: React.MouseEvent, msg: EmailMessage) => {
    e.stopPropagation();
    markAsRead(msg.id, !msg.isFlagged);
  }, [markAsRead]);

  const handleFilterChange = useCallback((filtered: EmailMessage[]) => {
    setFilteredMessages(filtered);
  }, []);

  const MAILBOX_LABELS: Record<string, string> = {
    '$inbox': 'Bandeja de entrada',
    '$sent': 'Enviados',
    '$drafts': 'Borradores',
    '$trash': 'Papelera',
    '$junk': 'No deseado',
    '$archive': 'Archivo',
    '$starred': 'Favoritos',
  };

  const mailboxLabel = MAILBOX_LABELS[selectedMailbox] || selectedMailbox;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b dark:border-gray-700 bg-white/90 dark:bg-slate-850 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">{mailboxLabel}</h1>
            <Badge variant="info">{filteredMessages.length}</Badge>
          </div>
          <div className="flex items-center gap-3">
            <MessageSearchBar
              placeholder={`Buscar en ${mailboxLabel}...`}
              onSearchComplete={() => loadInbox()}
            />
            <MessageFilters
              messages={filteredMessages}
              onFilterChange={handleFilterChange}
              onReset={() => loadInbox()}
            />
          </div>
        </div>
      </div>

      {/* Multi-select bar */}
      <MultiSelectBar
        selectedIds={selectedIds}
        totalCount={filteredMessages.length}
        onClear={() => { setSelectedIds(new Set()); setSelectAll(false); }}
        onAction={handleBulkAction}
      />

      {/* Message list */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-800">
        {isLoading && filteredMessages.length === 0 ? (
          <MessageListSkeleton />
        ) : filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
            <MailOpen className="w-12 h-12" />
            <p className="text-lg">No hay mensajes en {mailboxLabel}</p>
          </div>
        ) : (
          <>
            {/* Multi-select row header */}
            <div className="px-5 py-2.5 bg-gray-50/80 dark:bg-slate-850 border-b border-dashed border-gray-100">
              <button onClick={toggleSelectAll} className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                {selectAll ? <CheckSquare className="w-4 h-4" style={{ color: ACCENT_LIGHT }} /> : <CheckSquare className="w-4 h-4" />}
              </button>
              <span className="flex-1">Remitente</span>
              <span className="text-right">Fecha</span>
            </div>
            {filteredMessages.map((msg) => (
              <MessageRow key={msg.id} message={msg} isSelected={selectedIds.has(msg.id)} onClick={() => handleSelectMessage(msg)} onToggleFlag={toggleFlag} onToggleSelect={toggleSelectMsg} />
            ))}
          </>
        )}
        <div ref={observerTarget} className="h-4" />
      </div>
    </div>
  );
}

function MessageRow({ message, isSelected, onClick, onToggleFlag, onToggleSelect }: {
  message: EmailMessage;
  isSelected: boolean;
  onClick: () => void;
  onToggleFlag: (e: React.MouseEvent, msg: EmailMessage) => void;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
}) {
  const sender = message.from[0] ?? { name: 'Unknown', email: 'unknown' };

  return (
    <div onClick={onClick} className={`group flex items-start gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 cursor-pointer mb-1.5 border ${isSelected ? 'bg-[var(--crux-accent-light)] dark:bg-blue-950/30 shadow-lg' : !message.isSeen ? 'bg-white dark:bg-slate-850 hover:from-transparent hover:to-[var(--crux-accent-light)] bg-gradient-to-r dark:hover:from-blue-950/20 border-gray-100 dark:border-slate-700' : 'border-transparent hover:bg-gray-50 dark:hover:bg-slate-750'} ${!message.isSeen && 'border-l-[3px] border-l-[var(--crux-accent-light)] rounded-bl-md'}`}>
      <button onClick={(e) => onToggleSelect(message.id, e)} className={`mt-1 flex-shrink-0 p-1.5 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100 ${isSelected ? 'bg-[var(--crux-accent-light)]/30 hover:bg-[#7DA4E0]/30' : 'hover:bg-gray-100 dark:hover:bg-slate-700'} text-gray-400`}>
        {isSelected ? <CheckSquare className="w-4 h-4" style={{ color: ACCENT_LIGHT }} /> : <CheckSquare className="w-4 h-4" />}
      </button>
      <button onClick={(e) => onToggleFlag(e, message)} className="mt-[1px] flex-shrink-0 p-1.5 rounded-lg transition-all duration-200 hover:bg-yellow-50 dark:hover:bg-yellow-950/30">
        <Star className={`w-4 h-4 drop-shadow-sm ${message.isFlagged ? 'fill-yellow-400 text-yellow-500 scale-[1.08]' : 'text-gray-200 dark:text-slate-500 group-hover:text-yellow-300'}`} />
      </button>
      <div className={`relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold shadow-md ring-2 ${!message.isSeen ? 'bg-[var(--crux-accent-light)] text-white dark:bg-[#5D76ED] ring-[#7DA4E0]/60 dark:ring-[var(--crux-accent-light)]/30' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 ring-gray-200/60 dark:ring-slate-600/40'}`}>
        {sender.name?.[0]?.toUpperCase() ?? sender.email?.[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`text-sm truncate ${message.isFlagged ? 'font-semibold' : !message.isSeen ? 'font-bold text-slate-900 dark:text-slate-100' : 'font-medium text-gray-700 dark:text-slate-300'}`}>{sender.name || sender.email}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">{message.date ? formatDistanceToNow(parseISO(message.date), { addSuffix: true }) : ''}</span>
        </div>
        <div className={`text-sm truncate mb-0.5 ${!message.isSeen ? 'font-medium' : 'text-gray-600 dark:text-slate-400'}`}>{message.subject || '(Sin asunto)'}</div>
        <p className="text-xs text-gray-400 truncate">{message.previewText || '(Sin vista previa)'}</p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {message.hasAttachments && <Paperclip className="w-3.5 h-3.5 text-gray-400" />}
        {message.isEncrypted && <Badge variant="success" className="text-[10px] px-1 py-0">🔒</Badge>}
        {message.quarantine_status === 'suspicious' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
        {message.quarantine_status === 'quarantined' && <Badge variant="error" className="text-[10px] px-1 py-0">Cuarentena</Badge>}
      </div>
    </div>
  );
}