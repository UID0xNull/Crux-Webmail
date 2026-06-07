// ============================================================================
// Crux-Webmail Frontend — Tailwind CSS Config
// ============================================================================
// La UI está construida íntegramente con utilidades Tailwind. Dark mode por
// clase ('dark' en <html>, ver ThemeProvider). Se añaden los shades custom
// que usa la UI y que no existen en la paleta por defecto (slate-750/850,
// gray-750). Los tokens de marca (--crux-*) se consumen como valores
// arbitrarios (bg-[var(--crux-...)]) y no requieren declararse aquí.
// ============================================================================

import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Shades intermedios usados por la UI (Tailwind no los trae por defecto).
        slate: {
          750: '#283548',
          850: '#172033',
        },
        gray: {
          750: '#2b3440',
        },
      },
    },
  },
  plugins: [],
};

export default config;
