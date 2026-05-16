import type { Metadata } from 'next';
import { getThemeScript } from '@/lib/theme/ThemeProvider';

export const metadata: Metadata = {
  title: 'Crux Webmail',
  description: 'Zero-Trust Encrypted Webmail',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: getThemeScript() }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
