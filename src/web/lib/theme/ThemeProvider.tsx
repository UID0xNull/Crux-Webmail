'use client';

// ============================================================================
// Crux-Webmail — Theme Provider (Light / Dark / System)
// ============================================================================
// Full dark mode support with system preference detection, persisted storage,
// and zero flash-on-load (FOL).
// ============================================================================

import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { env } from '@/lib/env';
import type { FrontendEnv } from '@/lib/env';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
export type Theme = 'light' | 'dark';
export type ThemeMode = Theme | 'system';

interface ThemeContextValue {
  theme: Theme;           // Resolved: 'light' or 'dark'
  themeMode: ThemeMode;   // Selected: 'light', 'dark', or 'system'
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  systemTheme: Theme;     // Detected system preference
}

const STORAGE_KEY = 'crux:theme';
const CLASS_DARK = 'dark';

// ------------------------------------------------------------------
// System theme detection
// ------------------------------------------------------------------
function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    if (stored === 'system') return getSystemTheme();
  } catch { /* ignore */ }
  return getSystemTheme();
}

// ------------------------------------------------------------------
// Context
// ------------------------------------------------------------------
const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  themeMode: 'system',
  setThemeMode: () => {},
  toggleTheme: () => {},
  systemTheme: 'light',
});

// ------------------------------------------------------------------
// Hook
// ------------------------------------------------------------------
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// ------------------------------------------------------------------
// Server-safe initial hydration (prevents flash)
// ------------------------------------------------------------------
export function getThemeScript(): string {
  return `
(function(){
  try{
    var s=localStorage.getItem('crux:theme');
    var t=s==='dark'?(s==='dark'?'dark':'light'):s==='system'?(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):'light';
    if(t==='dark'){document.documentElement.classList.add('dark');}
    else{document.documentElement.classList.remove('dark');}
  }catch(e){}
})();`.trim();
}

// ------------------------------------------------------------------
// Provider
// ------------------------------------------------------------------
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const defaultMode: ThemeMode = (env.NEXT_PUBLIC_DEFAULT_THEME as ThemeMode) || 'system';
  const isInitialized = useRef(false);

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as ThemeMode) || defaultMode;
    } catch {
      return defaultMode;
    }
  });

  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);

  // Resolve effective theme
  const theme: Theme = themeMode === 'system' ? systemTheme : themeMode;

  // Apply class on change
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add(CLASS_DARK);
    } else {
      root.classList.remove(CLASS_DARK);
    }
  }, [theme]);

  // Persist mode selection
  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch { /* ignore */ }
  }, []);

  // Toggle: light → dark → light (ignores system mode, sets explicit)
  const toggleTheme = useCallback(() => {
    if (theme === 'dark') {
      setThemeMode('light');
    } else {
      setThemeMode('dark');
    }
  }, [theme, setThemeMode]);

  // Listen for system theme changes
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      setSystemTheme(getSystemTheme());
    };

    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, themeMode, setThemeMode, toggleTheme, systemTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}