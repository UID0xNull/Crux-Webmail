'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMailStore } from '@/lib/store/mail';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, Paperclip, FileText, Shield, Lock, Plus, X, Eye, CheckCircle, AlertCircle, MinusIcon } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';

interface Attachment { name: string; size: number; file: File }

export default function ComposePage() {
  const router = useRouter();
  const sendMail = useMailStore((s) => s.sendMail);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [useHtmlEditor, setUseHtmlEditor] = useState(true);
  const [encrypt, setEncrypt] = useState(false);
  const [sign, setSign] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (useHtmlEditor && !bodyText && bodyHtml) setBodyText(htmlToPlainText(bodyHtml));
    if (!useHtmlEditor && !bodyHtml && bodyText) setBodyHtml(bodyToHtml(bodyText));
  }, [useHtmlEditor]);

  const htmlToPlainText = (html: string) => {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
  };

  const bodyToHtml = (text: string) => text.replace(/\n/g, '<br>');

  const handleAddAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments((prev) => [...prev, ...files.map((file) => ({ name: file.name, size: file.size, file }))]);
    if (e.target) e.target.value = '';
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  function formatFileSize(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  }

  const handleSubmit = async () => {
    if (!to) setError('Falta destinatario'); return;
    setIsLoading(true); setError('');
    try {
      await sendMail({ to, cc: cc || undefined, bcc: bcc || undefined, subject, body: useHtmlEditor ? bodyHtml : bodyText, htmlBody: bodyHtml, textBody: bodyText, attachments: attachments.map((a) => a.file), encrypt, sign });
      setSuccess(true); setTimeout(() => router.push('/dashboard/inbox'), 1200);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error desconocido'); } finally { setIsLoading(false); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b dark:border-slate-700 bg-white/95 dark:bg-slate-850 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/inbox')}>
            <ChevronLeft className="mr-1 w-4 h-4"/> Cancelar
          </Button>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-gray-100">Redactar mensaje</h1>
        </div>
        <div className="flex items-center gap-2">
          {success && (
            <Badge variant="success" className="items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5"/> Enviado
            </Badge>
          )}
          <Button onClick={handleSubmit} disabled={isLoading || success}>
            {isLoading ? '...' : <Send className="w-4 h-4"/>} Enviar
          </Button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4"/> {error}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 bg-white dark:bg-slate-850">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Recipients row: To + CC/BCC toggle */}
          <label>
            <span className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">Para</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="destinatario@ejemplo.com"
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="destinatario@ejemplo.com"
              className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:[var(--crux-accent-light)] transition-all duration-200"
            />
            />
          </label>

          {/* CC/BCC */}
          <button type="button" onClick={() => setShowCcBcc((prev) => !prev)} className="text-xs text-gray-500 hover:text-[var(--crux-accent-light)] dark:text-gray-400 transition-colors flex items-center gap-1 cursor-pointer select-none">
            {showCcBcc ? (<MinusIcon className="w-3.5 h-3.5"/>) : (<Plus className="w-3.5 h-3.5"/>) } CC / BCC
          </button>

          {showCcBcc && (
            <>
              <label><span className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">CC</span><input type="email" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="copia@ejemplo.com" className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:indigo-500 transition-all duration-200"/></label>
              <label><span className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">BCC</span><input type="email" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="copia-oculta@ejemplo.com" className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:indigo-500 transition-all duration-200"/></label>
            </>
          )}

          {/* Subject */}
          <label>
            <span className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">Asunto</span>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del mensaje" className="w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:indigo-500 transition-all duration-200"/>
          </label>

          {/* Compose body */}
          <div className="relative">
            <div className="flex items-center justify-end gap-2 -mt-1 mb-0.5 text-xs text-gray-400 dark:text-gray-500">
              <span>{useHtmlEditor ? 'HTML' : 'Texto plano'}</span>
              <button type="button" onClick={() => { if (useHtmlEditor && !bodyText) setBodyText(htmlToPlainText(bodyHtml)); else if (!useHtmlEditor && !bodyHtml) setBodyHtml(bodyText); setUseHtmlEditor((prev) => !prev); }} title={useHtmlEditor ? 'Cambiar a texto plano' : 'Cambiar a HTML'}>
                {useHtmlEditor ? <FileText className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </button>
            </div>

            {!useHtmlEditor && !bodyHtml ? (
              <textarea value={bodyText} onChange={(e)=>setBodyText(e.target.value)} rows={12} className="w-full h-64 p-3 text-sm bg-white dark:bg-slate-800 border rounded-xl shadow-inner resize-none focus:outline-none focus:ring-2 focus:indigo-500 transition-all duration-200 placeholder:text-gray-400" />
            ) : (
              <>
                <div dangerouslySetInnerHTML={{ __html: bodyHtml }} className="min-h-[8rem] p-3 bg-white dark:bg-slate-800 rounded-xl mb-2" onClick={() => setUseHtmlEditor((p) => !p)} />
                {!useHtmlEditor && (
                  <>
                    <textarea value={bodyText} onChange={(e)=>setBodyText(e.target.value)} rows={12} className="w-full h-64 p-3 text-sm bg-white dark:bg-slate-800 border rounded-xl shadow-inner resize-none focus:outline-none focus:ring-2 focus-indigo-500 transition-all duration-200 placeholder:text-gray-400" />
                    <Button size="sm" className="mt-1" onClick={() => { setBodyText(htmlToPlainText(bodyHtml)); setUseHtmlEditor(true); }}>Usar editor HTML</Button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Attachments */}
          <input ref={fileInputRef} type="file" multiple onChange={handleAddAttachment} className="hidden"/>
          <label htmlFor="attachment-input" className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border bg-white hover:shadow-sm cursor-pointer transition-all duration-200 shadow-md font-medium">
            <Paperclip /> Adjuntar archivo
          </label>

          {attachments.length > 0 && (
            <>
              <span className="text-xs text-gray-500">{attachments.length} archivo(s) · {formatFileSize(attachments.reduce((sum, a) => sum + a.size, 0))}</span>
              <div className="space-y-1.5">
                {attachments.map((att, i) => (
                  <AttachmentCard key={i} attachment={att} onRemove={() => handleRemoveAttachment(i)} formatFileSize={formatFileSize} />
                ))}
              </div>
            </>
          )}

          {/* Encrypt / Sign options */}
          <div className="flex items-center gap-4 flex-wrap pt-2 border-t">
            <button type="button" onClick={() => setEncrypt((prev) => !prev)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 ${encrypt ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}>
              <Shield className="w-4 h-4"/> Encriptar (PGP) {encrypt ? '✓' : ''}
            </button>
            <button type="button" onClick={() => setSign((prev) => !prev)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 ${sign ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}>
              <Lock className="w-4 h-4"/> Firmar (PGP) {sign ? '✓' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttachmentCard({ attachment, onRemove, formatFileSize }: { attachment: Attachment; onRemove: () => void; formatFileSize?: (b: number) => string }) {
  const fmt = formatFileSize || (() => '');
  return (
    <div className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-slate-800 rounded-lg">
      <span>{attachment.name}</span>
      <span className="text-xs text-gray-400">{fmt(attachment.size)}</span>
      <Button variant="ghost" size="sm" onClick={onRemove}><X /></Button>
    </div>
  );
}