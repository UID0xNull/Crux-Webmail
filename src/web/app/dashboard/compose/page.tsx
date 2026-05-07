'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMailStore } from 'lib/store/mail';
import { Button } from 'components/ui/button';
import { Badge } from 'components/ui/badge';
import { Card } from 'components/ui/card';
import { sanitizeEmail, sanitizeDisplayName } from 'lib/sanitizer/html-sanitizer';
import type { EmailAddress, AttachmentData } from 'lib/types';
import {
  ChevronLeft,
  Send,
  X,
  Paperclip,
  FileText,
  Eye,
  EyeOff,
  Shield,
  Lock,
  AlertCircle,
  CheckCircle,
  Plus,
  Minus,
} from 'lucide-react';

// ------------------------------------------------------------------
// Compose Page — Full-featured email composition
// Integrates with useMailStore.composeMessage + sendMessage
// Supports: CC/BCC, attachments, E2E encryption toggle, PGP sign, draft save
// ------------------------------------------------------------------

export default function ComposePage() {
  const router = useRouter();
  const composeDraft = useMailStore((s) => s.composeDraft);
  const composeMessage = useMailStore((s) => s.composeMessage);
  const sendMessage = useMailStore((s) => s.sendMessage);
  const isLoading = useMailStore((s) => s.isLoading);

  // Local state mirroring store draft
  const [to, setTo] = useState<string>('');
  const [cc, setCc] = useState<string>('');
  const [bcc, setBcc] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [bodyHtml, setBodyHtml] = useState<string>('');
  const [bodyText, setBodyText] = useState<string>('');
  const [encrypt, setEncrypt] = useState<boolean>(false);
  const [sign, setSign] = useState<boolean>(true);
  const [showCcBcc, setShowCcBcc] = useState<boolean>(false);
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [useHtmlEditor, setUseHtmlEditor] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync from store draft on mount
  useEffect(() => {
    if (composeDraft) {
      setTo(
        composeDraft.to
          ?.map((addr) => addr.name ? `${addr.name} <${addr.email}>` : addr.email)
          .join(', ') ?? ''
      );
      setCc(
        composeDraft.cc
          ?.map((addr) => addr.name ? `${addr.name} <${addr.email}>` : addr.email)
          .join(', ') ?? ''
      );
      setBcc(
        composeDraft.bcc
          ?.map((addr) => addr.name ? `${addr.name} <${addr.email}>` : addr.email)
          .join(', ') ?? ''
      );
      setSubject(composeDraft.subject ?? '');
      setBodyHtml(composeDraft.body_html ?? '');
      setBodyText(composeDraft.body_text ?? '');
      setEncrypt(composeDraft.encrypt ?? false);
      setSign(composeDraft.sign ?? true);
    }
  }, []);

  const goBack = useCallback(() => {
    router.push('/dashboard/inbox');
  }, [router]);

  // Parse comma-separated address string into EmailAddress[]
  const parseAddresses = (input: string): EmailAddress[] => {
    return input
      .split(',')
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((raw) => {
        const emailMatch = raw.match(/(.+?)\s*<(.+?)>/);
        if (emailMatch) {
          return {
            name: sanitizeDisplayName(emailMatch[1].trim()),
            email: sanitizeEmail(emailMatch[2].trim()),
          };
        }
        return {
          name: '',
          email: sanitizeEmail(raw),
        };
      })
      .filter((addr) => addr.email);
  };

  // Generate plain text from HTML (stripped version)
  const htmlToPlainText = (html: string): string => {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const handleSend = useCallback(async () => {
    setError(null);
    setSuccess(false);

    // Validate recipients
    const toAddrs = parseAddresses(to);
    if (toAddrs.length === 0) {
      setError('Por favor ingresa al menos un destinatario válido en "Para"');
      return;
    }

    const ccAddrs = parseAddresses(cc);
    const bccAddrs = parseAddresses(bcc);

    // Update store with full draft
    const bodyTextContent = useHtmlEditor
      ? htmlToPlainText(bodyHtml)
      : bodyText;

    composeMessage({
      to: toAddrs,
      cc: ccAddrs.length > 0 ? ccAddrs : undefined,
      bcc: bccAddrs.length > 0 ? bccAddrs : undefined,
      subject,
      body_html: bodyHtml,
      body_text: bodyTextContent,
      encrypt,
      sign,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    try {
      await sendMessage();
      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard/inbox');
      }, 1500);
    } catch (err) {
      setError((err as Error).message || 'Error al enviar el mensaje');
    }
  }, [to, cc, bcc, subject, bodyHtml, bodyText, encrypt, sign, attachments, composeMessage, sendMessage, router, useHtmlEditor]);

  const handleAddAttachment = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      // Validate file size (max 25MB)
      if (file.size > 25 * 1024 * 1024) {
        setError(`"${file.name}" excede 25MB`);
        continue;
      }

      // Read as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;

      setAttachments((prev) => [
        ...prev,
        {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          data: base64.split(',')[1] ?? base64,
          size: file.size,
        },
      ]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Cancelar
          </Button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Redactar mensaje
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {success && (
            <Badge variant="success">
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
              Enviado
            </Badge>
          )}
          {error && (
            <Badge variant="error">
              <AlertCircle className="w-3.5 h-3.5 mr-1" />
              Error
            </Badge>
          )}
          <Button
            onClick={handleSend}
            disabled={isLoading || success}
            className="gap-2"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Enviar
          </Button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Compose Form */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* To */}
          <ComposeField
            label="Para"
            value={to}
            onChange={setTo}
            placeholder="destinatario@ejemplo.com"
          />

          {/* CC / BCC toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCcBcc((prev) => !prev)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex items-center gap-1"
            >
              {showCcBcc ? (
                <Minus className="w-3 h-3" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              CC / BCC
            </button>
          </div>

          {showCcBcc && (
            <>
              <ComposeField
                label="CC"
                value={cc}
                onChange={setCc}
                placeholder="copia@ejemplo.com"
              />
              <ComposeField
                label="BCC"
                value={bcc}
                onChange={setBcc}
                placeholder="copia-oculta@ejemplo.com"
              />
            </>
          )}

          {/* Subject */}
          <ComposeField
            label="Asunto"
            value={subject}
            onChange={setSubject}
            placeholder="Asunto del mensaje"
          />

          {/* Editor toggle */}
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-gray-500">
              {useHtmlEditor ? 'HTML' : 'Texto plano'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (useHtmlEditor && !bodyHtml) {
                  setBodyHtml(htmlToPlainText(bodyText));
                } else if (!useHtmlEditor && !bodyText) {
                  setBodyText(bodyHtml);
                }
                setUseHtmlEditor((prev) => !prev);
              }}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              title={useHtmlEditor ? 'Cambiar a texto plano' : 'Cambiar a HTML'}
            >
              {useHtmlEditor ? <FileText className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Body */}
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            {useHtmlEditor ? (
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                placeholder="Escribe tu mensaje..."
                className="w-full h-64 p-3 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset font-mono"
              />
            ) : (
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Escribe tu mensaje..."
                className="w-full h-64 p-3 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
              />
            )}
          </div>

          {/* Attachments section */}
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleAddAttachment}
              className="hidden"
              id="attachment-input"
            />
            <label
              htmlFor="attachment-input"
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors text-gray-600 dark:text-gray-300"
            >
              <Paperclip className="w-4 h-4" />
              Adjuntar archivo
            </label>

            {attachments.length > 0 && (
              <span className="text-xs text-gray-400">
                {attachments.length} archivo(s) · {formatFileSize(attachments.reduce((sum, a) => sum + a.size, 0))}
              </span>
            )}
          </div>

          {/* Attachment list */}
          {attachments.length > 0 && (
            <div className="space-y-1">
              {attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                >
                  <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
                    {att.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatFileSize(att.size)}
                  </span>
                  <button
                    onClick={() => handleRemoveAttachment(i)}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Encryption and Signing options */}
          <Card className="p-3">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Encrypt toggle */}
              <button
                type="button"
                onClick={() => setEncrypt((prev) => !prev)}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border
                  ${encrypt
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
                  }
                `}
                title="Cifrar mensaje end-to-end con WebCrypto AES-256-GCM"
              >
                {encrypt ? <Lock className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {encrypt ? 'Cifrado activado' : 'Cifrado desactivado'}
              </button>

              {/* Sign toggle */}
              <button
                type="button"
                onClick={() => setSign((prev) => !prev)}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors border
                  ${sign
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
                  }
                `}
                title="Firmar digitalmente con OpenPGP"
              >
                {sign ? <Shield className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {sign ? 'Firma PGP activada' : 'Firma PGP desactivada'}
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Reusable Compose Field Component
// ------------------------------------------------------------------
function ComposeField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16 pt-2.5 flex-shrink-0">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      />
    </div>
  );
}