'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMailStore } from '@/lib/store/mail';
import { MessageListSkeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { MessageSearchBar } from '@/components/email/MessageSearchBar';
import { MessageFilters } from '@/components/email/MessageFilters';
import { MultiSelectBar } from '@/components/email/MultiSelectBar';
import { MailOpen, Star, Paperclip, AlertTriangle, CheckSquare, Check, Eye, EyeOff, Archive, Trash2, Layers, ListFilter, Settings2 } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import type { EmailMessage } from '@/lib/types';

// ------------------------------------------------------------------
// Density config
// ------------------------------------------------------------------
type MessageDensity = 'comfortable' | 'compact' | 'dense';

const DENSITY_CONFIG: Record<MessageDensity, { rowClass: string; avatarSize: string; iconSize: string }> = {
  comfortable: { rowClass: 'py-3.5 px-4 gap-3', avatarSize: 'w-10 h-10 text-sm', iconSize: 'w-3.5 h-3.5' },
  compact:     { rowClass: 'py-2.5 px-4 gap-2',   avatarSize: 'w-9 h-9 text-xs',    iconSize: 'w-3 h-3' },
  dense:       { rowClass: 'py-1.5 px-4 gap-1.5',  avatarSize: 'w-8 h-8 text-[10px]', iconSize: 'w-2.5 h-2.5' },
};

const DENSITY_LABELS: Record<MessageDensity, string> = {
  comfortable: 'Cómoda',
  compact:     'Compacta',
  dense:       'Densa',
};

// ------------------------------------------------------------------
// Density selector (inline toggle)
// ------------------------------------------------------------------
function DensitySelector({ value, onChange }: { value: MessageDensity; onChange: (d: MessageDensity) => void }) {
  const options: MessageDensity[] = ['comfortable', 'compact', 'dense'];
  return (
    <div className="flex items-center rounded-lg border border-gray-200 dark:border-slate-600 bg-white/80 dark:bg-slate-750/80 p-0.5 backdrop-blur-sm">
      {options.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`relative z-10 px-2 py-1 text-[11px] font-medium rounded-md transition-all duration-200 ${
            value === d
              ? 'bg-gradient-to-r from-blue-500/90 to-blue-600/90 text-white shadow-sm'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
          }`}
        >
          {DENSITY_LABELS[d]}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// MessageRow — cards with subtle shadows, status indicators
// ------------------------------------------------------------------
function MessageRow({ message, isSelected, onClick, onToggleFlag, onToggleSelect, density }: {
  message: EmailMessage;
  isSelected: boolean;
  onClick: () => void;
  onToggleFlag: (e: React.MouseEvent, msg: EmailMessage) => void;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  density?: MessageDensity;
}) {
  const sender = message.from[0] ?? { name: 'Unknown', email: 'unknown' };

  return (
    <div onClick={onClick} className={`group relative flex items-start ${DENSITY_CONFIG[density].rowClass} rounded-xl transition-all duration-200 cursor-pointer mb-1.5 border`}>
      {/* Unread indicator stripe */}
      {!message.isSeen && (
        <div className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-blue-500 to-indigo-500 rounded-l-md shadow-sm" />
      )}

      {/* Card background with subtle hover */}
      <div className={`absolute inset-0 rounded-xl transition-all duration-200 ${
        isSelected 
          ? 'bg-gradient-to-r from-blue-100/70 to-transparent dark:from-blue-950/40 dark:to-transparent ring-1 ring-blue-300/60 shadow-md'
          : !message.isSeen
            ? 'bg-white dark:bg-slate-850 hover:bg-gradient-to-r hover:from-blue-50/70 hover:to-transparent dark:hover:from-blue-950/20 shadow-sm hover:shadow-md'
            : 'bg-white/80 dark:bg-slate-850/80 hover:bg-gray-50/80 dark:hover:bg-slate-800/80 border-transparent hover:shadow-sm'
      }`} />

      {/* Selection checkbox */}
      <button onClick={(e) => onToggleSelect(message.id, e)} className={`relative z-10 mt-[2px] flex-shrink-0 p-1.5 rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100 ${isSelected ? 'bg-blue-100/80 hover:bg-blue-200/60 dark:bg-blue-900/40' : 'hover:bg-gray-100 dark:hover:bg-slate-700'} text-gray-400`}>
        {isSelected ? <CheckSquare className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
      </button>

      {/* Star */}
      <button onClick={(e) => onToggleFlag(e, message)} className={`relative z-10 mt-[2px] flex-shrink-0 p-1.5 rounded-lg transition-all duration-200 hover:bg-yellow-50/80 dark:hover:bg-yellow-950/30`}>
        <Star className={`w-4 h-4 drop-shadow-sm ${message.isFlagged ? 'fill-yellow-400 text-yellow-500 scale-[1.08] transition-transform duration-200' : 'text-gray-200 dark:text-slate-500 group-hover:text-yellow-300/70'}`} />
      </button>

      {/* Avatar */}
      <div className={`relative z-10 ${DENSITY_CONFIG[density].avatarSize} rounded-full flex items-center justify-center flex-shrink-0 font-semibold shadow-sm ring-[1.5px] transition-all duration-200 ${!message.isSeen ? 'bg-gradient-to-br from-blue-500/90 to-indigo-600/90 text-white dark:from-blue-500 dark:to-indigo-700 ring-blue-200/50 dark:ring-blue-800/40' : 'bg-gradient-to-br from-gray-100 to-slate-50 dark:from-slate-700 dark:to-slate-600 text-gray-600 dark:text-gray-300 ring-gray-200/60 dark:ring-slate-600/40'}`}>
        {sender.name?.[0]?.toUpperCase() ?? sender.email?.[0]?.toUpperCase() ?? '?'}
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-[2px]">
          <span className={`truncate ${message.isFlagged ? 'font-semibold' : !message.isSeen ? 'font-bold text-slate-900 dark:text-slate-100' : 'font-medium text-gray-700 dark:text-slate-300'}`}>{sender.name || sender.email}</span>
          <span className="text-[11px] text-gray-400 flex-shrink-0 tabular-nums">{message.date ? formatDistanceToNow(parseISO(message.date), { addSuffix: true }) : ''}</span>
        </div>
        <div className={`truncate mb-[2px] ${!message.isSeen ? 'font-medium text-slate-800 dark:text-slate-200' : 'text-gray-600 dark:text-slate-400'}`}>{message.subject || '(Sin asunto)'}</div>
        <p className={`text-xs truncate opacity-70 ${!message.isSeen ? 'font-medium text-gray-500 dark:text-slate-500' : 'text-gray-400 dark:text-slate-600'}`}>{message.previewText || '(Sin vista previa)'}</p>
      </div>

      {/* Status indicators */}
      <div className="relative z-10 flex flex-col items-end gap-1.5 flex-shrink-0">
        {message.hasAttachments && (
          <Paperclip className={`${DENSITY_CONFIG[density].iconSize} text-gray-400 group-hover:text-blue-500 transition-colors`} />
        )}
        {message.isEncrypted && (
          <Badge variant="success" className={`text-[10px] px-1.5 py-0 shadow-sm`}>🔒</Badge>
        )}
        {message.quarantine_status === 'suspicious' && (
          <AlertTriangle className={`${DENSITY_CONFIG[density].iconSize} text-amber-500 animate-pulse`} />
        )}
        {message.quarantine_status === 'quarantined' && (
          <Badge variant="error" className="text-[10px] px-1.5 py-0 shadow-sm">Cuarentena</Badge>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// No results box
// ------------------------------------------------------------------
function NoResultsBox({ mailboxLabel, onRefresh }: { mailboxLabel: string; onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-slate-500 gap-3 p-8">
      <MailOpen className="w-12 h-12 opacity-40" />
      <p className="text-base font-medium">{mailboxLabel} está vacía.</p>
      <button onClick={onRefresh} className="px-3 py-1.5 text-sm rounded-lg bg-blue-100/80 hover:bg-blue-200/60 dark:bg-blue-900/40 transition-colors">
        Refrescar
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// Page component
// ------------------------------------------------------------------
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

  // Intersection observer for infinite scroll
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
      if (next.has(id)) { next.delete(id); return next; }
      next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(selectAll ? [] : rawMessages.map((m) => m.id)));
    setSelectAll(!selectAll);
  }, [rawMessages, selectAll]);

  const toggleFlag = useCallback(
    async (e: React.MouseEvent, msg: EmailMessage) => {
      e.stopPropagation();
      try { await markAsRead(msg.id, !msg.isFlagged); } catch {}
    },
    [markAsRead]
  );

  const handleToggleSelect = useCallback(
    (id: string, e: React.MouseEvent) => toggleSelectMsg(id, e),
    [toggleSelectMsg]
  );

  const toggleSelectAll = useCallback(() => {
    setSelectAll((prev) => !prev);
    setSelectedIds((prev) => (prev.size === rawMessages.length ? new Set<string>() : new Set(rawMessages.map((m) => m.id))));
  }, [rawMessages]);

  const handleFilterChange = useCallback(
    (filtered: EmailMessage[]) => {
      setFilteredMessages((prev) => {
        if (prev.length === filtered.length && prev.every((m, i) => m.id === filtered[i]?.id)) {
          return prev;
        }
        return filtered;
      });
    },
    []
  );

  function toggleSelectMessage(msg: EmailMessage) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msg.id)) { next.delete(msg.id); return next; }
      next.add(msg.id);
      return next;
    });
  }

  const handleBulkAction = useCallback(
    async (action: string, ids: string[]) => {
      switch (action) {
        case 'delete':
          await Promise.all(ids.map((id) => deleteMessage(id)));
          break;
        default:
          console.log('bulk action:', action, ids);
      }
    },
    [deleteMessage]
  );

  const mailboxLabel = selectedMailbox === '$inbox'
    ? 'Bandeja de entrada' 
    : (selectedMailbox as string).replace('mail/', '').replace('$', '');

  // Persist density in localStorage
  const [density, setDensity] = useState<MessageDensity>(() => {
    try { return (localStorage.getItem('message-density') as MessageDensity) || 'comfortable'; } catch { return 'comfortable'; }
  });

  useEffect(() => {
    try { localStorage.setItem('message-density', density); } catch {}
  }, [density]);

  return (
    <div className="flex h-full overflow-hidden bg-gradient-to-br from-gray-50/80 to-white dark:from-slate-900 dark:to-slate-950">
      {/* Sidebar */}
      <aside className="w-[240px] border-r dark:border-slate-700 flex flex-col bg-gradient-to-b from-gray-50/80 to-white/60 dark:from-slate-850 dark:to-slate-900/60 backdrop-blur-sm">
        <div className="p-4 border-b dark:border-slate-700">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
            Inbox
          </h2>
        </div>

        {/* Mailboxes */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {['$inbox', '$sent', '$drafts', '$trash', '$junk', '$archive'].map((id) => (
            <button
              key={id}
              onClick={() => router.push(`/${id}`)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-left group ${selectedMailbox === id ? 'bg-gradient-to-r from-blue-100/70 to-transparent dark:from-blue-950/40 ring-1 ring-blue-200/50 dark:ring-blue-800/30 shadow-sm' : 'hover:bg-gray-50/80 dark:hover:bg-slate-750/60 hover:shadow-sm border border-transparent'}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${selectedMailbox === id ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md' : 'bg-gray-100 dark:bg-slate-700/80 text-gray-600 dark:text-slate-300 group-hover:from-blue-200/40 group-hover:to-transparent'}`}>
                {id === '$inbox' && <MailOpen className="w-4 h-4" />}
                {id === '$sent' && <Paperclip className="w-4 h-4" />}
                {id === '$drafts' && <Paperclip className="w-4 h-4" />}
                {id === '$trash' && <AlertTriangle className="w-4 h-4" />}
                {id === '$junk' && <AlertTriangle className="w-4 h-4" />}
                {id === '$archive' && <MailOpen className="w-4 h-4" />}
              </div>
              <span className={`font-medium transition-all duration-200 ${selectedMailbox === id ? 'text-blue-600 dark:text-blue-300' : 'text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-white'}`}>
                {id === '$inbox' && 'Bandeja de entrada'}
                {id === '$sent' && 'Enviados'}
                {id === '$drafts' && 'Borradores'}
                {id === '$trash' && 'Papelera'}
                {id === '$junk' && 'Spam'}
                {id === '$archive' && 'Archivados'}
              </span>
            </button>
          ))}
        </div>

        {/* Bottom actions */}
        <div className="p-3 border-t dark:border-slate-700 space-y-2">
          <button onClick={handleSelectAll} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-100/80 hover:bg-gray-200/60 dark:bg-slate-700/40 dark:hover:bg-slate-600/40 transition-all duration-200 text-sm font-medium text-gray-600 dark:text-slate-300">
            {selectAll ? <CheckSquare className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
            Seleccionar todo
          </button>
          <button onClick={async () => { await Promise.all(Array.from(selectedIds).map((id) => deleteMessage(id))); setSelectedIds(new Set()); setSelectAll(false); }} disabled={selectedIds.size === 0} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 hover:bg-red-100/80 dark:bg-red-950/40 dark:hover:bg-red-900/60 transition-all duration-200 text-sm font-medium text-red-600 disabled:opacity-30">
            <AlertTriangle className="w-4 h-4" />
            Eliminar
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm">
        {/* Header */}
        <div className="px-4 py-3 border-b dark:border-gray-700 bg-white/90 dark:bg-slate-850 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">{mailboxLabel}</h1>
              <Badge variant="info">{filteredMessages.length}</Badge>
            </div>
            
            {/* Search + Filters */}
            <div className="flex items-center gap-3">
              <MessageSearchBar
                placeholder={`Buscar en ${mailboxLabel}...`}
                onSearchComplete={() => loadInbox()}
              />
              <MessageFilters
                messages={rawMessages}
                onFilterChange={handleFilterChange}
                onReset={() => loadInbox()}
              />
            </div>

            {/* Density selector */}
            <DensitySelector value={density} onChange={setDensity} />
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <MessageListSkeleton />
          ) : filteredMessages.length === 0 ? (
            <NoResultsBox mailboxLabel={mailboxLabel} onRefresh={() => loadInbox()} />
          ) : (
            <>
              {/* Multi-select row header */}
              {selectedIds.size > 1 && (
                <div className="px-5 py-2.5 bg-gray-50/80 dark:bg-slate-850 border-b border-dashed border-gray-100">
                  <button onClick={toggleSelectAll} className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                    {selectAll ? <CheckSquare className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                  </button>
                  <span className="flex-1">Remitente</span>
                  <span className="text-right">Fecha</span>
                </div>
              )}
              
              {filteredMessages.map((msg) => (
                <MessageRow
                  key={msg.id}
                  message={msg}
                  isSelected={selectedIds.has(msg.id)}
                  onClick={() => toggleSelectMessage(msg)}
                  onToggleFlag={toggleFlag}
                  onToggleSelect={handleToggleSelect}
                  density={density}
                />
              ))}

              {/* Intersection observer target */}
              <div ref={observerTarget} className="h-1" />

              {hasMore && !isLoading && (
                <button onClick={() => loadMore()} className="w-full py-3 text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-750 transition-colors">
                  Cargar más mensajes...
                </button>
              )}
            </>
          )}
        </div>

        {/* Multi-select bar */}
        {selectedIds.size > 0 && (
          <MultiSelectBar
            selectedIds={selectedIds}
            totalCount={filteredMessages.length}
            onClear={() => setSelectedIds(new Set())}
            onAction={(action, ids) => handleBulkAction(action, ids)}
          />
        )}
      </main>
    </div>
  );
}