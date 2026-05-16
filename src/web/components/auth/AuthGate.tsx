'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore, hydrateAuth } from 'lib/store/auth';

// ------------------------------------------------------------------
// Configurable delay (ms) before redirecting to /login on failure
// ------------------------------------------------------------------
const REDIRECT_DELAY_MS = 1500;

// ------------------------------------------------------------------
// Props
// ------------------------------------------------------------------
interface AuthGateProps {
  children: React.ReactNode;
  /** Roles allowed to pass. Undefined = allow all authenticated users */
  requireRole?: string[];
}

export default function AuthGate({ children, requireRole }: AuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentToken = useAuthStore((s) => s.token);
  const currentUser = useAuthStore((s) => s.user);
  const currentExpiresAt = useAuthStore((s) => s.expiresAt);
  const clearSession = useAuthStore((s) => s.clearSession);

  // ---------------------------------------------------------------
  // Redirect to login (preserve current path for post-login redirect)
  // ---------------------------------------------------------------
  const scheduleRedirect = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRedirecting(true);
    timerRef.current = setTimeout(() => {
      const query = pathname !== '/login' ? `?redirect=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${query}`);
    }, REDIRECT_DELAY_MS);
  }, [router, pathname]);

  // ---------------------------------------------------------------
  // Initial hydration: verify session on mount
  // ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ok = await hydrateAuth();
      if (!cancelled) {
        setHydrated(true);
        if (ok) {
          setAuthenticated(true);
        } else {
          setAuthenticated(false);
          scheduleRedirect();
        }
      }
    })();

    return () => { cancelled = true; };
  }, [scheduleRedirect]);

  // ---------------------------------------------------------------
  // Live token watcher — kick out if token disappears
  // ---------------------------------------------------------------
  useEffect(() => {
    if (hydrated && !currentToken && !redirecting) {
      setAuthenticated(false);
      scheduleRedirect();
    }
  }, [hydrated, currentToken, redirecting, scheduleRedirect]);

  // ---------------------------------------------------------------
  // Expiry watcher — clear session if token expires
  // ---------------------------------------------------------------
  useEffect(() => {
    if (currentExpiresAt && Date.now() >= currentExpiresAt) {
      clearSession();
    }
  }, [currentExpiresAt, clearSession]);

  // ---------------------------------------------------------------
  // Role check
  // ---------------------------------------------------------------
  const hasRequiredRole = useCallback((): boolean => {
    if (!requireRole || requireRole.length === 0) return true;
    const userRoles = currentUser?.roles ?? [];
    return requireRole.some((role) => userRoles.includes(role));
  }, [currentUser, requireRole]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------
  // Reject if roles not met
  // ---------------------------------------------------------------
  useEffect(() => {
    if (authenticated && !hasRequiredRole()) {
      setAuthenticated(false);
      clearSession();
      router.replace('/login');
    }
  }, [authenticated, hasRequiredRole, clearSession, router]);

  // ---------------------------------------------------------------
  // Loading — verifying session
  // ---------------------------------------------------------------
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

  // ---------------------------------------------------------------
  // Not authenticated — transitioning to login
  // ---------------------------------------------------------------
  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a1a]">
        <div className="text-center">
          <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-red-500/30 border-t-red-500" />
          <p className="animate-pulse text-sm text-red-300/60">Sesión expirada. Redirigiendo…</p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // Authenticated + role OK — pass through
  // ---------------------------------------------------------------
  return <>{children}</>;
}