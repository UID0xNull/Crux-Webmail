'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hydrateAuth } from 'lib/store/auth';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const authenticated = await hydrateAuth();
      if (!cancelled) {
        if (authenticated) {
          router.replace('/dashboard/inbox');
        } else {
          router.replace('/login');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a1a]">
      <div className="text-center">
        <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-500" />
        <p className="animate-pulse text-sm text-white/30">Redirigiendo…</p>
      </div>
    </div>
  );
}