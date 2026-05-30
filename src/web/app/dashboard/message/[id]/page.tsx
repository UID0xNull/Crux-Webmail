'use client';

import { useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMailStore } from '@/lib/store/mail';
import { sanitizeHtml } from '@/lib/sanitizer/html-sanitizer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageListSkeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft, Reply, Star, Trash2, ShieldCheck, Lock, AlertTriangle, FileText,
  CalendarDays, Paperclip, Mail, Users
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { EmailMessage, EmailAddress } from '@/lib/types';

export default function MessageViewPage() {
  const params = useParams();
  const router = useRouter();
  const messageId = params.id as string;

  const selectedMessage = useMailStore((s) => s.selectedMessage);
  const isLoading = useMailStore((s) => s.isLoading);
  const loadMessage = useMailStore((s) => s.loadMessage);
  const markAsRead = useMailStore((s) => s.markAsRead);
  const deleteMessage = useMailStore((s) => s.deleteMessage);

  useEffect(() => {
    if (messageId) loadMessage(messageId);
  }, [messageId, loadMessage]);

  const goBack = useCallback(() => { router.push('/dashboard/inbox'); }, [router]);
  const handleToggleFlag = useCallback(() => {
    if (selectedMessage) markAsRead(selectedMessage.id, !selectedMessage.isFlagged);
  }, [selectedMessage, markAsRead]);
  const handleDelete = useCallback(() => {
    if (selectedMessage) { deleteMessage(selectedMessage.id); router.push('/dashboard/inbox'); }
  }, [selectedMessage, deleteMessage, router]);

  // Loading state
  if (isLoading && !selectedMessage) return <div className="h-full flex items-center justify-center"><MessageListSkeleton /></div>;

  if (!isLoading && !selectedMessage) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center gap-5 text-slate-400 dark:text-gray-500">
        <FileText className="w-20 h-20 opacity-60" />
        <p className="text-lg font-medium">Mensaje no encontrado</p>
        <Button variant="secondary" onClick={goBack}>Volver al Inbox</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--crux-bg-page)] dark:bg-[var(--crux-base-950)]">
      {/* Top bar — glassmorphism, reduced visual weight */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-[var(--crux-base-200)]/40 dark:border-[var(--crux-base-700)]/40 bg-white/75 dark:bg-[var(--crux-base-900)]/75 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={goBack} className="text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-gray-200 transition-colors duration-300">
            <ChevronLeft className="w-4 h-4 mr-1.5" /> Volver al Inbox
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => {}} className="text-slate-600 dark:text-slate-300 transition-colors duration-300 hover:bg-[var(--crux-base-150)] dark:hover:bg-[var(--crux-base-800)]">
              <Reply className="w-4 h-4 mr-1.5" /> Responder
            </Button>
            {selectedMessage?.isFlagged ? (
              <Button variant="ghost" size="sm" onClick={handleToggleFlag} title="Quitar bandera" className="text-amber-500 hover:text-amber-600 dark:text-amber-400 transition-colors duration-300">
                <Star className="w-4 h-4 mr-1.5 fill-amber-400 text-amber-400" /> Marcado
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={handleToggleFlag} title="Marcar como importante" className="text-slate-600 hover:text-slate-800 dark:text-slate-300 transition-colors duration-300">
                <Star className="w-4 h-4 mr-1.5" />
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={handleDelete} className="transition-colors duration-300 hover:bg-red-600 dark:hover:bg-red-700">
              <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar
            </Button>
          </div>
        </div>
      </div>

      {/* Email content — improved readability for prolonged reading */}
      <div className="flex-1 overflow-y-auto">
        <article className="max-w-[720px] mx-auto px-6 md:px-8 lg:px-12 py-8 md:py-10 lg:py-14">
          {/* Subject heading — softer weight, comfortable size */}
          <h1 className="text-xl sm:text-2xl font-semibold text-[var(--crux-text-title)] dark:text-gray-50 mb-6 leading-tight tracking-tight">
            {selectedMessage?.subject || '(Sin Asunto)'}
          </h1>

          {/* Meta info — date, status */}
          <div className="flex items-center gap-4 flex-wrap text-sm text-slate-500 dark:text-gray-400 mb-6 pb-6 border-b border-[var(--crux-base-200)]/40 dark:border-[var(--crux-base-700)]/40">
            {selectedMessage?.date && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                {format(new Date(selectedMessage.date), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
              </span>
            )}
            {selectedMessage?.date && (
              <span className="text-slate-400 dark:text-gray-500">({formatDistanceToNow(new Date(selectedMessage.date), { addSuffix: true, locale: es })})</span>
            )}
          </div>

          {/* Status badges — compact */}
          <div className="flex items-center gap-2 flex-wrap mb-6 pb-5 border-b border-[var(--crux-base-200)]/40 dark:border-[var(--crux-base-700)]/40">
            {selectedMessage?.isEncrypted && (<Badge variant="success"><Lock className="w-3.5 h-3.5 inline mr-1" /> Cifrado</Badge>)}
            {selectedMessage?.isSigned && (<Badge variant="info"><ShieldCheck className="w-3.5 h-3.5 inline mr-1" /> Firmado</Badge>)}
            {selectedMessage?.quarantine_status === 'suspicious' && (
              <Badge variant="warning"><AlertTriangle className="w-3.5 h-3.5 inline mr-1" /> Sospechoso</Badge>) }
            {selectedMessage?.quarantine_status === 'quarantined' && (<Badge variant="error">Cuarentena</Badge>)}
          </div>

          {/* Sender info — warm, approachable */}
          <SenderInfo sender={selectedMessage?.from?.[0]} to={selectedMessage?.to || []} cc={selectedMessage?.cc || []} />

          {/* Sanitized Body — optimized for prolonged reading */}
          {selectedMessage && <SanitizedEmailBody message={selectedMessage} />}
        </article>
      </div>
    </div>
  );
}

// Sender info with avatar, name and recipient details
function SenderInfo({ sender, to, cc }: { sender?: EmailAddress; to: EmailAddress[]; cc?: EmailAddress[] }) {
  const name = sender?.name || sender?.email || 'Desconocido';
  return (
    <div className="flex items-start gap-4 mb-8 pb-6 border-b border-[var(--crux-base-200)]/40 dark:border-[var(--crux-base-700)]/40">
      <SenderAvatar sender={sender} />
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="font-semibold text-sm text-slate-800 dark:text-gray-100 leading-snug">
          {name} &lt;{sender?.email}&gt;
        </p>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-gray-500">
          <Mail className="w-3 h-3" />
          <span>A: {to.map(t => t.name || t.email).join(', ')}</span>
        </div>
        {cc?.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-gray-500">
            <Users className="w-3 h-3" />
            <span>Cc: {cc.map(c => c.name || c.email).join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Sender Avatar component — color based on email hash
function SenderAvatar({ sender }: { sender?: EmailAddress }) {
  const name = sender?.name || sender?.email || '?';
  const initial = name[0]?.toUpperCase() || '?';
  const colors = [
    'bg-rose-500', 'bg-orange-500', 'bg-amber-400', 'bg-emerald-500',
    'bg-sky-500', 'bg-indigo-500', 'violet-500', 'bg-pink-500'
  ];
  const idx = (sender?.email || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return <div className={`w-12 h-12 rounded-full ${colors[idx]} flex items-center justify-center text-white font-bold text-lg shadow-md`}>{initial}</div>;
}

// XSS-sanitized HTML body — optimized for comfortable reading over long periods
function SanitizedEmailBody({ message }: { message: EmailMessage }) {
  const safe = sanitizeHtml(message.previewText || '');
  
  return (
    <div className="email-body prose prose-base dark:prose-invert max-w-none">
      <style jsx>{`
        .email-body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          word-wrap: break-word;
          overflow-wrap: break-word;
          color: var(--crux-text-primary);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        
        /* Headings — softer weight, comfortable spacing */
        .email-body h1 { font-size: 1.5rem; font-weight: 600; margin-top: 2em; margin-bottom: 1em; line-height: 1.35; color: var(--crux-text-title); }
        .email-body h2 { font-size: 1.35rem; font-weight: 600; margin-top: 1.75em; margin-bottom: 0.9em; line-height: 1.4; color: var(--crux-text-title); }
        .email-body h3 { font-size: 1.2rem; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.75em; line-height: 1.45; color: var(--crux-text-title); }

        /* Paragraphs — reduced contrast, generous spacing */
        .email-body p {
          margin-bottom: 1.25em;
          color: var(--crux-text-primary);
          font-size: 16px;
          line-height: 1.75;
          letter-spacing: -0.008em;
        }

        /* Links — softer, more readable */
        .email-body a {
          color: var(--crux-accent-main);
          text-decoration: underline;
          text-underline-offset: 2px;
          transition: color 200ms ease;
        }
        
        .email-body a:hover {
          color: #3730a3;
        }

        /* Lists */
        .email-body ul,
        .email-body ol {
          padding-left: 1.5em;
          margin-bottom: 1.25em;
          color: var(--crux-text-primary);
        }

        .email-body li {
          margin-bottom: 0.3em;
          line-height: 1.7;
        }

        /* Blockquote — subtle, elegant */
        .email-body blockquote {
          border-left: 3px solid var(--crux-accent-main);
          padding-left: 1.25em;
          margin: 1.25em 0;
          color: #64748b;
          font-style: italic;
          background-color: rgba(99, 102, 241, 0.04);
        }

        /* Tables */
        .email-body table {
          border-collapse: collapse;
          width: 100%;
          margin-bottom: 1.25em;
        }
        
        .email-body th,
        .email-body td {
          padding: 0.75rem;
          border: 1px solid var(--crux-base-300);
        }

        /* Images */
        .email-body img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 1.25em 0;
        }

        /* Code blocks — soft background, comfortable reading */
        .email-body pre,
        .email-body code {
          font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
          font-size: 0.85rem;
          line-height: 1.65;
        }
        
        .email-body pre {
          background-color: var(--crux-base-150);
          padding: 1em;
          border-radius: 8px;
          overflow-x: auto;
          border: 1px solid var(--crux-base-200);
        }

        .email-body code {
          background-color: var(--crux-base-150);
          padding: 0.15em 0.4em;
          border-radius: 4px;
          font-size: 0.875em;
        }

        /* Horizontal rule */
        .email-body hr {
          border: none;
          height: 1px;
          background-color: var(--crux-base-200);
          margin: 2.5em 0;
        }

        /* Strong/bold — slightly softer weight */
        .email-body strong, .email-body b { font-weight: 600; color: var(--crux-text-title); }

        /* Emphasized text — italic */
        .email-body em, .email-body i { font-style: italic; color: #4b5563; }

        /* Dark mode overrides — reduced contrast throughout */
        .dark .email-body {
          background-color: transparent;
        }
        
        .dark .email-body h1,
        .dark .email-body h2,
        .dark .email-body h3 {
          color: var(--crux-text-title);
        }
        
        .dark .email-body p {
          color: #cbd5e1;
        }

        .dark .email-body a {
          color: var(--crux-accent-main);
        }
        
        .dark .email-body a:hover {
          color: #a5b4fc;
        }

        .dark .email-body blockquote {
          border-left-color: rgba(99, 102, 241, 0.3);
          background-color: rgba(99, 102, 241, 0.06);
          color: #94a3b8;
        }

        .dark .email-body th,
        .dark .email-body td {
          border-color: var(--crux-base-700);
        }

        .dark .email-body pre {
          background-color: rgba(99, 102, 241, 0.06);
          border-color: var(--crux-base-700);
        }

        .dark .email-body code {
          background-color: rgba(99, 102, 241, 0.08);
        }

        .dark .email-body hr {
          background-color: var(--crux-base-700);
        }

        .dark .email-body strong,
        .dark .email-body b {
          color: #e2e8f0;
        }

        .dark .email-body em,
        .dark .email-body i {
          color: #94a3b8;
        }
      `}</style>
      
      <div dangerouslySetInnerHTML={{ __html: safe }} />
    </div>
  );
}