'use client';

import { useState, useCallback } from 'react';
import { useMailStore } from 'lib/store/mail';
import { ChevronDown, Filter, X, Calendar, Paperclip, Star, Eye, AlertTriangle } from 'lucide-react';
import type { EmailMessage } from 'lib/types';

// ------------------------------------------------------------------
// Filter types
// ------------------------------------------------------------------

export type FilterKey = 'seen' | 'flagged' | 'hasAttachments' | 'minSize' | 'maxSize' | 'dateFrom' | 'dateTo';
export type SortKey = 'date' | 'from' | 'subject' | 'size';
export type SortDirection = 'asc' | 'desc';

export interface ActiveFilters {
  seen?: boolean;
  flagged?: boolean;
  hasAttachments?: boolean;
  minSize?: number;
  maxSize?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface MessageFiltersProps {
  /** Messages to filter */
  messages: EmailMessage[];
  /** Callback with filtered + sorted messages */
  onFilterChange: (filtered: EmailMessage[], count: number) => void;
  /** Reset callback */
  onReset?: () => void;
}

// ------------------------------------------------------------------
// Filter Panel — Collapsible with toggle filters
// ------------------------------------------------------------------

export function MessageFilters({ messages, onFilterChange, onReset }: MessageFiltersProps) {
  const [open, setOpen] = useState<boolean>(false);
  const [filters, setFilters] = useState<ActiveFilters>({});
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const toggleFilter = useCallback((key: FilterKey, value: boolean | string | number | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (next[key] === value) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setFilters({});
    setSortBy('date');
    setSortDir('desc');
    onReset?.();
  }, [onReset]);

  // Apply filters + sort
  const getFilteredMessages = useCallback((): EmailMessage[] => {
    let result = [...messages];

    // Seen/Unseen
    if (filters.seen !== undefined) {
      result = result.filter((m) => m.isSeen === filters.seen);
    }

    // Flagged
    if (filters.flagged !== undefined) {
      result = result.filter((m) => m.isFlagged === filters.flagged);
    }

    // Has attachments
    if (filters.hasAttachments !== undefined) {
      result = result.filter((m) => m.hasAttachments === filters.hasAttachments);
    }

    // Size filters (bytes)
    if (filters.minSize !== undefined) {
      result = result.filter((m) => m.size >= filters.minSize!);
    }
    if (filters.maxSize !== undefined) {
      result = result.filter((m) => m.size <= filters.maxSize!);
    }

    // Date range
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom).getTime();
      result = result.filter((m) => new Date(m.date).getTime() >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo).getTime();
      result = result.filter((m) => new Date(m.date).getTime() <= to);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'date':
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
          break;
        case 'from':
          cmp = (a.from[0]?.email ?? '').localeCompare(b.from[0]?.email ?? '');
          break;
        case 'subject':
          cmp = (a.subject ?? '').localeCompare(b.subject ?? '');
          break;
        case 'size':
          cmp = a.size - b.size;
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [messages, filters, sortBy, sortDir]);

  // Apply on every change
  const filtered = getFilteredMessages();
  onFilterChange(filtered, filtered.length);

  const hasActiveFilters = Object.keys(filters).length > 0 || sortBy !== 'date' || sortDir !== 'desc';

  const formatDateInput = (value: string) => {
    return value || '';
  };

  return (
    <div className="relative">
      {/* Filter Toggle Button */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((prev) => !prev)}
          className={`
            flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors
            ${open
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }
          `}
        >
          <Filter className="w-4 h-4" />
          Filtros
          {hasActiveFilters && (
            <span className="w-5 h-5 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
              {Object.keys(filters).length}
            </span>
          )}
        </button>

        {/* Sort selector */}
        <div className="relative">
          <select
            value={`${sortBy}-${sortDir}`}
            onChange={(e) => {
              const [by, dir] = e.target.value.split('-') as [SortKey, SortDirection];
              setSortBy(by);
              setSortDir(dir);
            }}
            className="text-xs px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-6"
          >
            <option value="date-desc">Más recientes</option>
            <option value="date-asc">Más antiguos</option>
            <option value="from-asc">Remitente A→Z</option>
            <option value="from-desc">Remitente Z→A</option>
            <option value="subject-asc">Asunto A→Z</option>
            <option value="subject-desc">Asunto Z→A</option>
            <option value="size-desc">Mayor tamaño</option>
            <option value="size-asc">Menor tamaño</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors"
            title="Limpiar todos los filtros"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter Panel (dropdown) */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 z-50 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Filtrar mensajes
          </h4>

          {/* Quick toggles */}
          <div className="space-y-2">
            <FilterToggle
              label="No leídos"
              icon={Eye}
              active={filters.seen === false}
              onToggle={() => toggleFilter('seen', filters.seen === false ? undefined : false)}
            />
            <FilterToggle
              label="Leídos"
              icon={Eye}
              active={filters.seen === true}
              onToggle={() => toggleFilter('seen', filters.seen === true ? undefined : true)}
            />
            <FilterToggle
              label="Con bandera"
              icon={Star}
              active={filters.flagged === true}
              onToggle={() => toggleFilter('flagged', filters.flagged === true ? undefined : true)}
            />
            <FilterToggle
              label="Con adjuntos"
              icon={Paperclip}
              active={filters.hasAttachments === true}
              onToggle={() => toggleFilter('hasAttachments', filters.hasAttachments === true ? undefined : true)}
            />
          </div>

          {/* Date range */}
          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <label className="text-xs text-gray-500 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Desde
            </label>
            <input
              type="date"
              value={formatDateInput(filters.dateFrom || '')}
              onChange={(e) => toggleFilter('dateFrom', e.target.value || undefined)}
              className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-500 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Hasta
            </label>
            <input
              type="date"
              value={formatDateInput(filters.dateTo || '')}
              onChange={(e) => toggleFilter('dateTo', e.target.value || undefined)}
              className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Suspicious */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <FilterToggle
              label="Sospechosos"
              icon={AlertTriangle}
              active={filters.seen === false && filters.flagged === true}
              disabled
              hint="Filtrado por el servidor"
            />
          </div>

          {/* Apply / Clear */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={clearAll}
              className="flex-1 text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Limpiar
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex-1 text-xs px-2 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Individual Filter Toggle
// ------------------------------------------------------------------
function FilterToggle({
  label,
  icon: Icon,
  active,
  onToggle,
  disabled,
  hint,
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`
        w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left
        ${disabled
          ? 'opacity-40 cursor-not-allowed'
          : active
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }
      `}
    >
      <Icon className={`w-3.5 h-3.5 ${disabled ? 'text-amber-500' : ''}`} />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
      {active && (
        <span className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
          <span className="text-white text-[8px]">✓</span>
        </span>
      )}
    </button>
  );
}