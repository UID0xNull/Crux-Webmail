'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hydrateAuth } from 'lib/store/auth';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ok = await hydrateAuth();
      if (!cancelled) {
        setHydrated(true);
        if (ok) {
          setAuthenticated(true);
        } else {
          router.replace('/login');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a1a]">
        <div className="text-center">
          <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-500" />
          <p className="animate-pulse text-sm text-white/30">Verificando sesión…</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a1a]">
        <div className="text-center">
          <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-500" />
          <p className="animate-pulse text-sm text-white/30">Redirigiendo…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}