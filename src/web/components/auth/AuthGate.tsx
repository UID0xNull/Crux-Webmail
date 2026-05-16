'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hydrateAuth } from 'lib/store/auth';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const authenticated = await hydrateAuth();
      if (!cancelled) {
        if (!authenticated) {
          router.replace('/login');
        } else {
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a1a]">
        <div className="text-center">
          <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-500" />
          <p className="animate-pulse text-sm text-white/30">Verificando sesión…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}