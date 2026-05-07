'use client';

import { useCallback, useState } from 'react';
import { isSafeAttachment } from 'lib/sanitizer/html-sanitizer';
import type { AttachmentData, EmailMessage } from 'lib/types';
import {
  Paperclip,
  Eye,
  Download,
  X,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  File,
  ShieldAlert,
  FileSpreadsheet,
  FileCode,
} from 'lucide-react';

// ------------------------------------------------------------------
// AttachmentViewer — Preview y descarga segura de adjuntos
// ------------------------------------------------------------------
interface AttachmentViewerProps {
  message: EmailMessage;
  attachments?: AttachmentData[];
  onOpenPreview?: (attachment: AttachmentData) => void;
}

export function AttachmentViewer({
  message,
  attachments,
  onOpenPreview,
}: AttachmentViewerProps) {
  if (!message.hasAttachments && (!attachments || attachments.length === 0)) {
    return null;
  }

  const items = attachments && attachments.length > 0
    ? attachments
    : getPlaceholderAttachments(message);

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
        <Paperclip className="w-4 h-4" />
        Adjuntos ({items.length})
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((att, i) => (
          <AttachmentCard
            key={i}
            attachment={att}
            onPreview={onOpenPreview}
          />
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Individual Attachment Card
// ------------------------------------------------------------------
function AttachmentCard({
  attachment,
  onPreview,
}: {
  attachment: AttachmentData;
  onPreview?: (attachment: AttachmentData) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const isSafe = isSafeAttachment(attachment.mimeType, attachment.name);
  const isImage = attachment.mimeType.startsWith('image/');
  const isPDF = attachment.mimeType === 'application/pdf';
  const isText = attachment.mimeType.startsWith('text/');
  const isOffice = attachment.mimeType.includes('vnd.openxmlformats');

  const getFileIcon = () => {
    if (isImage) return ImageIcon;
    if (isPDF) return FileText;
    if (isText) return FileCode;
    if (isOffice) return FileSpreadsheet;
    return File;
  };

  const Icon = getFileIcon();

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handlePreview = useCallback(() => {
    if (!isSafe) return;
    if (isImage) {
      setShowPreview(true);
      return;
    }
    onPreview?.(attachment);
  }, [isSafe, isImage, onPreview, attachment]);

  const handleDownload = useCallback(() => {
    if (!isSafe) return;

    const link = document.createElement('a');
    link.href = `data:${attachment.mimeType};base64,${attachment.data}`;
    link.download = attachment.name;
    link.click();
  }, [attachment, isSafe]);

  return (
    <div
      className={`
        flex items-center gap-3 p-3 rounded-lg border transition-colors
        ${isSafe
          ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750'
          : 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
        }
      `}
    >
      {/* Icon */}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
        isSafe
          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
      }`}>
        <Icon className="w-5 h-5" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
          {attachment.name}
        </p>
        <p className="text-xs text-gray-400">
          {formatSize(attachment.size)} · {attachment.mimeType.split('/')[1]?.toUpperCase()}
        </p>
        {!isSafe && (
          <div className="flex items-center gap-1 mt-0.5 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="w-3 h-3" />
            <span className="text-[10px]">Tipo de archivo bloqueado</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {isSafe && (
          <>
            <button
              onClick={handlePreview}
              disabled={!isSafe}
              className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Vista previa"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-green-600 dark:hover:text-green-400 transition-colors"
              title="Descargar"
            >
              <Download className="w-4 h-4" />
            </button>
          </>
        )}
        {!isSafe && (
          <div className="p-1.5 text-red-400" title="Archivo bloqueado por seguridad">
            <AlertTriangle className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {showPreview && isImage && (
        <ImagePreviewModal
          src={`data:${attachment.mimeType};base64,${attachment.data}`}
          alt={attachment.name}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Image Preview Modal
// ------------------------------------------------------------------
function ImagePreviewModal({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa de imagen"
    >
      <div
        className="relative max-w-4xl max-h-[90vh] m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Placeholder attachments (when the API doesn't return body parts)
// ------------------------------------------------------------------
function getPlaceholderAttachments(message: EmailMessage): AttachmentData[] {
  // Generate placeholders based on message size
  const estimatedAttachments = Math.min(Math.max(Math.floor(message.size / 500000), 1), 5);
  return Array.from({ length: estimatedAttachments }).map((_, i) => ({
    name: `attachment_${i + 1}.${message.mimeType || 'pdf'}`,
    mimeType: 'application/octet-stream',
    data: '',
    size: Math.floor(message.size / estimatedAttachments),
  }));
}