'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMailStore } from 'lib/store/mail';
import { Search, X, Loader2 } from 'lucide-react';

// ------------------------------------------------------------------
// MessageSearchBar — Full-text search con debounce
// ------------------------------------------------------------------
interface MessageSearchBarProps {
  /** Placeholder text */
  placeholder?: string;
  /** Pre-filled query */
  defaultQuery?: string;
  /** Callback when search completes */
  onSearchComplete?: () => void;
}

export function MessageSearchBar({
  placeholder = 'Buscar en esta bandeja...',
  defaultQuery = '',
  onSearchComplete,
}: MessageSearchBarProps) {
  const searchQuery = useMailStore((s) => s.searchQuery);
  const searchMessages = useMailStore((s) => s.searchMessages);
  const setSearch = useMailStore((s) => s.setSearch);
  const isLoading = useMailStore((s) => s.isLoading);
  const selectedMailbox = useMailStore((s) => s.selectedMailbox);

  const [input, setInput] = useState<string>(defaultQuery);
  const [focused, setFocused] = useState<boolean>(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync input when searchQuery changes externally
  useEffect(() => {
    if (searchQuery !== input) {
      setInput(searchQuery);
    }
  }, [searchQuery]);

  // Debounced search
  const handleInput = useCallback((value: string) => {
    setInput(value);
    setSearch(value);

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!value.trim()) {
      // Clear search → reload inbox
      onSearchComplete?.();
      return;
    }

    debounceRef.current = setTimeout(async () => {
      await searchMessages(value.trim());
      onSearchComplete?.();
    }, 400);
  }, [searchMessages, setSearch, onSearchComplete]);

  const handleClear = useCallback(() => {
    setInput('');
    setSearch('');
    inputRef.current?.focus();
    onSearchComplete?.();
  }, [setSearch, onSearchComplete]);

  // Keyboard shortcut: Ctrl+K / Cmd+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      className={`
        relative transition-all duration-200
        ${focused ? 'z-50' : 'z-10'}
      `}
    >
      <div className="flex items-center">
        <Search
          className={`
            absolute left-3 w-4 h-4 pointer-events-none transition-colors
            ${focused
              ? 'text-blue-500'
              : 'text-gray-400'
            }
          `}
        />

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className={`
            w-64 pl-9 pr-8 py-1.5 text-sm rounded-lg border
            bg-white dark:bg-gray-700
            text-gray-900 dark:text-gray-100
            placeholder:text-gray-400 dark:placeholder:text-gray-500
            focus:outline-none focus:ring-2 transition-all duration-200
            ${focused
              ? 'border-blue-400 ring-blue-500/20 shadow-lg shadow-blue-500/10'
              : 'border-gray-300 dark:border-gray-600'
            }
          `}
        />

        {/* Clear button */}
        {input.trim() && (
          <button
            onClick={handleClear}
            className="absolute right-8 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Limpiar búsqueda"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute right-2">
            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
          </div>
        )}
      </div>

      {/* Active search indicator */}
      {searchQuery && (
        <div className="absolute -bottom-5 left-0 text-[10px] text-gray-400 dark:text-gray-500">
          Buscando: "{searchQuery}"
        </div>
      )}
    </div>
  );
}