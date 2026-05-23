'use client';

import { useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMailStore } from 'lib/store/mail';
import { sanitizeHtml } from 'lib/sanitizer/html-sanitizer';
import { Badge } from 'components/ui/badge';
import { Button } from 'components/ui/button';
import { MessageListSkeleton } from 'components/ui/skeleton';
import { ChevronLeft, Reply, Star, Trash2, Paperclip, ShieldCheck, Lock, AlertTriangle, FileText } from 'lucide-react';
import { format } from 'date-fns';
import type { EmailMessage, EmailAddress } from 'lib/types';

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
      <div className="h-full flex flex-col items-center justify-center gap-4 text-gray-400">
        <FileText className="w-16 h-16" />
        <p>Message not found</p>
        <Button variant="secondary" onClick={goBack}>Back to Inbox</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-900">
        <Button variant="ghost" onClick={goBack}><ChevronLeft className="w-4 h-4 mr-1" /> Back to Inbox</Button>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm"><Reply className="w-3.5 h-3.5" /></Button>
          {selectedMessage?.isFlagged ? (
            <Button variant="ghost" size="sm" onClick={handleToggleFlag} title="Unflag"><Star className="w-4 h-4 fill-amber-400 text-amber-400" /></Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={handleToggleFlag}><Star className="w-4 h-4" /></Button>
          )}
          <Button variant="danger" size="sm" onClick={handleDelete}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100 mb-3">
            {selectedMessage?.subject || '(No Subject)'}
          </h1>

          <div className="flex items-center gap-2 flex-wrap mb-6">
            {selectedMessage?.isEncrypted && (<Badge variant="success"><Lock className="w-3 h-3 inline mr-1" /> Encrypted</Badge>)}
            {selectedMessage?.isSigned && (<Badge variant="info"><ShieldCheck className="w-3 h-3 inline mr-1" /> Signed</Badge>)}
            {selectedMessage?.quarantine_status === 'suspicious' && (
              <Badge variant="warning"><AlertTriangle className="w-3 h-3 inline mr-1" /> Suspicious</Badge>) }
            {selectedMessage?.quarantine_status === 'quarantined' && (<Badge variant="error">Quarantined</Badge>)}
          </div>

          <div className="flex items-start gap-4 mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
            <SenderAvatar sender={selectedMessage?.from?.[0]} />
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-slate-900 dark:text-gray-100">
                {selectedMessage?.from?.[0]?.name || selectedMessage?.from?.[0]?.email || 'Unknown'} &lt;{selectedMessage?.from?.[0]?.email}&gt;
              </span>
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">To: {selectedMessage?.to?.map(t => t.name || t.email).join(', ')}</div>
            </div>
          </div>

          {/* Sanitized Body */}
          <SanitizedEmailBody message={selectedMessage!} />
        </div>
      </div>
    </div>
  );
}

// Sender Avatar component
function SenderAvatar({ sender }: { sender?: EmailAddress }) {
  const name = sender?.name || sender?.email || '?';
  const initial = name[0]?.toUpperCase() || '?';
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500'];
  const idx = (sender?.email || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return <div className={`w-11 h-11 rounded-full ${colors[idx]} flex items-center justify-center text-white font-bold`}>{initial}</div>;
}

// XSS-sanitized HTML body
function SanitizedEmailBody({ message }: { message: EmailMessage }) {
  const safe = sanitizeHtml(message.previewText || '');
  return <div className="email-body prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: safe }} />;
}

ENDOFFILE