'use client';

import { useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMailStore } from '../../../../lib/store/mail';
import { sanitizeHtml } from '../../../../lib/sanitizer/html-sanitizer';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { MessageListSkeleton } from '../../../../components/ui/skeleton';
import {
  ChevronLeft,
  Reply,
  ReplyAll,
  Forward,
  Star,
  Trash2,
  Archive,
  Paperclip,
  ShieldCheck,
  Lock,
  AlertTriangle,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import type { EmailMessage, EmailAddress } from '../../../../lib/types';

// ------------------------------------------------------------------
// Thread/Message View Page - XSS Sanitized
// Uses sanitizeHtml to prevent DOM-based XSS
// ------------------------------------------------------------------
export default function MessageViewPage() {
  const params = useParams();
  const router = useRouter();
  const messageId = params.id as string;

  const selectedMessage = useMailStore((s) => s.selectedMessage);
  const isLoading = useMailStore((s) => s.isLoading);
  const loadMessage = useMailStore((s) => s.loadMessage);
  const markAsRead = useMailStore((s) => s.markAsRead);
  const deleteMessage = useMailStore((s) => s.deleteMessage);
  const composeMessage = useMailStore((s) => s.composeMessage);

  useEffect(() => {
    if (messageId) {
      loadMessage(messageId);
    }
  }, [messageId, loadMessage]);

  const goBack = useCallback(() => {
    router.push('/dashboard/inbox');
  }, [router]);

  const handleReply = useCallback(() => {
    if (selectedMessage) {
      const replyTo: EmailAddress[] = [selectedMessage.from[0]];
      // Add original to/cc if reply-all
      composeMessage({
        to: replyTo,
        subject: `Re: ${selectedMessage.subject}`,
        body_html: `
          <blockquote style="border-left: 3px solid #ddd; padding-left: 8px; color: #666;">
            ${selectedMessage.previewText}
          </blockquote>
          <p><br/></p>
        `,
        body_text: `
--- Original message ---
${selectedMessage.previewText}

`,
      });
      router.push('/dashboard/compose');
    }
  }, [selectedMessage, composeMessage, router]);

  const handleReplyAll = useCallback(() => {
    if (selectedMessage) {
      const allRecipients: EmailAddress[] = [
        ...(selectedMessage.to || []),
        ...(selectedMessage.cc || []),
      ];
      // Filter out self
      composeMessage({
        to: allRecipients.length > 0 ? allRecipients : [selectedMessage.from[0]],
        subject: `Re: ${selectedMessage.subject}`,
        body_html: `
          <blockquote style="border-left: 3px solid #ddd; padding-left: 8px; color: #666;">
            ${selectedMessage.previewText}
          </blockquote>
          <p><br/></p>
        `,
        body_text: `--- Original message ---\n${selectedMessage.previewText}\n\n`,
      });
      router.push('/dashboard/compose');
    }
  }, [selectedMessage, composeMessage, router]);

  const handleForward = useCallback(() => {
    if (selectedMessage) {
      composeMessage({
        subject: `Fwd: ${selectedMessage.subject}`,
        body_html: `
          <blockquote style="border-left: 3px solid #ddd; padding-left: 8px; color: #666;">
            <p><strong>From:</strong> ${selectedMessage.from[0]?.name} &lt;${selectedMessage.from[0]?.email}&gt;</p>
            <p><strong>To:</strong> ${selectedMessage.to?.map(t => t.email).join(', ')}</p>
            <p><strong>Date:</strong> ${selectedMessage.date}</p>
            <p><strong>Subject:</strong> ${selectedMessage.subject}</p>
            <br/>
            ${selectedMessage.previewText}
          </blockquote>
          <p><br/></p>
        `,
        body_text: `
--- Forwarded message ---
From: ${selectedMessage.from[0]?.name} <${selectedMessage.from[0]?.email}>
To: ${selectedMessage.to?.map(t => t.email).join(', ')}
Date: ${selectedMessage.date}
Subject: ${selectedMessage.subject}

${selectedMessage.previewText}

`,
      });
      router.push('/dashboard/compose');
    }
  }, [selectedMessage, composeMessage, router]);

  const handleToggleFlag = useCallback(() => {
    if (selectedMessage) {
      markAsRead(selectedMessage.id, !selectedMessage.isFlagged);
    }
  }, [selectedMessage, markAsRead]);

  const handleDelete = useCallback(() => {
    if (selectedMessage) {
      deleteMessage(selectedMessage.id);
      router.push('/dashboard/inbox');
    }
  }, [selectedMessage, deleteMessage, router]);

  // Loading
  if (isLoading && !selectedMessage) {
    return (
      <div className="h-full flex items-center justify-center">
        <MessageListSkeleton />
      </div>
    );
  }

  // Not found
  if (!isLoading && !selectedMessage) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-gray-400">
        <FileText className="w-16 h-16" />
        <p className="text-lg">Message not found</p>
        <Button variant="secondary" onClick={goBack}>Back to Inbox</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Action Bar */}
      <MessageActionBar
        onBack={goBack}
        onReply={handleReply}
        onReplyAll={handleReplyAll}
        onForward={handleForward}
        onFlag={handleToggleFlag}
        onDelete={handleDelete}
        isFlagged={selectedMessage?.isFlagged ?? false}
      />

      {/* Message Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-4">
          {/* Subject + Badges */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100 mb-3">
              {selectedMessage?.subject || '(No Subject)'}
            </h1>

            <div className="flex items-center gap-2 flex-wrap">
              {selectedMessage?.isEncrypted && (
                <Badge variant="success">
                  <Lock className="w-3 h-3 inline mr-1" />
                  Encrypted
                </Badge>
              )}
              {selectedMessage?.isSigned && (
                <Badge variant="info">
                  <ShieldCheck className="w-3 h-3 inline mr-1" />
                  Signed
                </Badge>
              )}
              {selectedMessage?.quarantine_status === 'suspicious' && (
                <Badge variant="warning">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  Suspicious
                </Badge>
              )}
              {selectedMessage?.quarantine_status === 'quarantined' && (
                <Badge variant="error">Quarantined</Badge>
              )}
            </div>
          </div>

          {/* Header: from, to, date */}
          <div className="flex items-start gap-4 mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
            {/* Sender Avatar */}
            <SenderAvatar sender={selectedMessage?.from?.[0]} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-gray-100">
                    {selectedMessage?.from?.[0]?.name || selectedMessage?.from?.[0]?.email || 'Unknown'}
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    &lt;{selectedMessage?.from?.[0]?.email}&gt;
                  </span>
                </div>
                <span className="text-sm text-gray-400 flex-shrink-0">
                  {selectedMessage?.date
                    ? (() => {
                        try {
                          return format(new Date(selectedMessage.date), 'PPpp');
                        } catch {
                          return selectedMessage.date;
                        }
                      })()
                    : ''}
                </span>
              </div>

              {/* Recipients */}
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                To: {selectedMessage?.to?.map(t => t.name || t.email).join(', ')}
              </div>
              {selectedMessage?.cc && selectedMessage.cc.length > 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-500">
                  Cc: {selectedMessage.cc.map(c => c.name || c.email).join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* Body - Sanitized HTML */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {selectedMessage?.bodyStructure && (
              <SanitizedEmailBody message={selectedMessage} />
            ) || (
              <p className="text-gray-500 italic">No body content available</p>
            )}
          </div>

          {/* Attachments */}
          {selectedMessage?.hasAttachments && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                Attachments
              </h3>
              <AttachmentList />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Action Bar
// ------------------------------------------------------------------
function MessageActionBar({
  onBack, onReply, onReplyAll, onForward, onFlag, onDelete, isFlag

// ------------------------------------------------------------------
// Sender Avatar
// ------------------------------------------------------------------
function SenderAvatar({ sender }: { sender?: EmailAddress }) {
  const name = sender?.name || sender?.email || '?';
  const initial = name[0]?.toUpperCase() || '?';
  const colors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-green-500',
    'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500',
  ];
  const colorIndex = (sender?.email || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;

  return (
    <div className={`w-11 h-11 rounded-full ${colors[colorIndex]} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
      {initial}
    </div>
  );
}

// ------------------------------------------------------------------
// Sanitized Email Body - CRITICAL for XSS protection
// ------------------------------------------------------------------
function SanitizedEmailBody({ message }: { message: EmailMessage }) {
  const bodyContent = message.previewText || '';
  const safeHtml = sanitizeHtml(bodyContent);

  return (
    <div
      className="email-body"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}

// ------------------------------------------------------------------
// Attachment List placeholder
// ------------------------------------------------------------------
function AttachmentList() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {/* Attachments would be rendered here when body parts are loaded */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <Paperclip className="w-5 h-5 text-gray-400" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">attachment.pdf</p>
          <p className="text-xs text-gray-400">2.4 MB</p>
        </div>
      </div>
    </div>
  );
}
