import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crux Webmail',
  description: 'Zero-Trust Encrypted Webmail',
};

// Inlined to avoid importing a 'use client' module into a Server Component.
// Reads localStorage and applies the dark class before React hydrates to prevent flash.
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('crux:theme');var t=s==='dark'?'dark':s==='system'?(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):'light';if(t==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
