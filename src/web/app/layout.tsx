import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crux Webmail',
  description: 'Zero-Trust Encrypted Webmail',
};

// Global styles — Tailwind directives + custom CSS
import '@/styles/base.css';

// Inlined to avoid importing a 'use client' module into a Server Component.
// Reads localStorage and applies the dark class before React hydrates to prevent flash.
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('crux:theme');var t=s==='dark'?'dark':s==='system'?(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):'light';if(t==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased min-h-screen">
        {/* Subtle noise overlay for depth */}
        <div className="pointer-events-none fixed inset-0 z-50 opacity-[0.02] mix-blend-overlay" aria-hidden>
          <svg width="100%" height="100%" xmlns="http://www.w3.org/200/svg"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#noise)" opacity="1"/></svg>
        </div>
        {children}
      </body>
    </html>
  );
}
