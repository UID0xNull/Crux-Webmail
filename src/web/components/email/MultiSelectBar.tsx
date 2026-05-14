'use client';

import { useMailStore } from '@/lib/store/mail';
import { Button } from '@/components/ui/button';
import { Trash2, Archive, Eye, EyeOff, Star, CheckSquare, X, MailOpen } from 'lucide-react';
import type { EmailMessage } from '@/lib/types';

// ------------------------------------------------------------------
// MultiSelectBar — Barra de acciones cuando hay mensajes seleccionados
// ------------------------------------------------------------------
interface MultiSelectBarProps {
  selectedIds: Set<string>;
  totalCount: number;
  onClear: () => void;
  onAction: (action: string, ids: string[]) => void;
}

export function MultiSelectBar({
  selectedIds,
  totalCount,
  onClear,
  onAction,
}: MultiSelectBarProps) {
  if (selectedIds.size === 0) return null;

  return (
    <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
          {selectedIds.size} de {totalCount} seleccionado(s)
        </span>
      </div>

      <div className="flex items-center gap-1">
        <ActionButton
          icon={Eye}
          label="Marcar leído"
          onClick={() => onAction('markRead', Array.from(selectedIds))}
        />
        <ActionButton
          icon={EyeOff}
          label="Marcar no leído"
          onClick={() => onAction('markUnread', Array.from(selectedIds))}
        />
        <ActionButton
          icon={Star}
          label="Bandera"
          onClick={() => onAction('toggleFlag', Array.from(selectedIds))}
        />
        <ActionButton
          icon={Archive}
          label="Archivar"
          onClick={() => onAction('archive', Array.from(selectedIds))}
        />
        <ActionButton
          icon={Trash2}
          label="Eliminar"
          variant="danger"
          onClick={() => onAction('delete', Array.from(selectedIds))}
        />

        <div className="w-px h-6 bg-blue-200 dark:bg-blue-800 mx-1" />

        <button
          onClick={onClear}
          className="p-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 transition-colors"
          title="Deseleccionar todo"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Action button helper
// ------------------------------------------------------------------
function ActionButton({
  icon: Icon,
  label,
  variant,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  variant?: 'default' | 'danger';
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={`
        gap-1 text-xs
        ${variant === 'danger'
          ? 'text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
          : 'text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30'
        }
      `}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </Button>
  );
}