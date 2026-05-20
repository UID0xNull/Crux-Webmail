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
    <div className="flex min-h-screen items-center justify-center bg-[#020817]">
      <div className="text-center">
        <div
          aria-label="Loading"
          className="mx-auto mb-5 h-9 w-9 animate-spin rounded-full border-[3px] border-violet-400/15 border-t-violet-400" />
        <p className="text-xs tracking-wide text-slate-400">Redirigiendo…</p>
      </div>
    </div>
  );
}