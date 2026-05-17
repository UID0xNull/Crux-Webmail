'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore, hydrateAuth } from 'lib/store/auth';
import type { ClientFingerprint } from 'lib/types';

// ─── SVG Icons ─────────────────────────────────────────────────────
function MailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0V10.5m13.5 0v9a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5v-9m13.5-2.25H6.75" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.77m-6.227 0a10.522 10.522 0 0 0 3.846 1.392" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12.178 6.752l4.093 4.093" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-5 w-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

// ─── Suspense fallback ───────────────────────────────────────────
function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-500" />
        <p className="animate-pulse text-sm text-white/30">Cargando…</p>
      </div>
    </div>
  );
}

// ─── Login Form (uses Zustand store) ─────────────────────────────
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectParam = params.get('redirect');

  const { isAuthenticated, isLoading, error, login, clearSession } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [touched, setTouched] = useState<{ username: boolean; password: boolean }>({
    username: false,
    password: false,
  });
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Hydrate auth state from cookie + Fingerprint ──────────────
  useEffect(() => {
    (async () => {
      await hydrateAuth();
    })();

    const fp: ClientFingerprint = {
      browser: navigator.userAgent.split(' ')[0],
      os: navigator.platform,
      screen: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      languages: navigator.languages,
      hash: generateFingerprint(),
    };
    useAuthStore.getState().updateFingerprint(fp);
    setMounted(true);
    setTimeout(() => inputRef.current?.focus(), 600);
  }, []);

  // ── Redirect if already authenticated ─────────────────────────
  useEffect(() => {
    if (isAuthenticated && mounted) {
      router.replace(redirectParam || '/dashboard/inbox');
    }
  }, [isAuthenticated, router, mounted, redirectParam]);

  // ── Sync global error → local ─────────────────────────────────
  useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLocalError(null);
      setTouched({ username: true, password: true });

      if (!username.trim() || !password.trim()) {
        setLocalError('Completa todos los campos para continuar.');
        return;
      }

      const ip = await getPublicIp();
      const fp = useAuthStore.getState().fingerprint;

      const success = await login({
        username: username.trim(),
        password,
        client_fingerprint: fp?.hash ?? '',
        ip: ip ?? '',
        cert_serial: '',
      });

      if (success) {
        router.replace(redirectParam || '/dashboard/inbox');
      }
    },
    [username, password, login, router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSubmit(e as unknown as React.FormEvent);
      }
    },
    [handleSubmit]
  );

  // ── Render ────────────────────────────────────────────────────
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[#0a0a1a] px-4 py-12"
    >
      <div className={`mx-auto w-full max-w-md transition-all duration-700 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
        {/* Brand */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 shadow-lg shadow-violet-500/30 ring-1 ring-white/20 backdrop-blur-sm">
            <MailIcon />
          </div>
          <h1 className="bg-gradient-to-r from-white via-violet-200 to-fuchsia-200 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
            Crux Webmail
          </h1>
          <p className="mt-2 text-sm text-white/40">
            Inicia sesión en tu bandeja segura
          </p>
        </div>

        {/* Glass Card */}
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate>
            {/* Username */}
            <div className="mb-5">
              <label htmlFor="username" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-white/30">
                Usuario o correo
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-white/30">
                  <UserIcon />
                </div>
                <input
                  ref={inputRef}
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                  className={`w-full rounded-2xl border bg-white/[0.03] px-4 py-3.5 pl-12 text-sm text-white placeholder-white/20 outline-none transition-all duration-200
                    focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 focus:bg-white/[0.06]
                    ${touched.username && !username ? 'border-red-500/50 ring-1 ring-red-500/20' : 'border-white/10 hover:border-white/20'}`}
                  placeholder="tu@ejemplo.com"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password */}
            <div className="mb-6">
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-white/30">
                Contraseña
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-white/30">
                  <LockIcon />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  className={`w-full rounded-2xl border bg-white/[0.03] px-4 py-3.5 pl-12 pr-12 text-sm text-white placeholder-white/20 outline-none transition-all duration-200
                    focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 focus:bg-white/[0.06]
                    ${touched.password && !password ? 'border-red-500/50 ring-1 ring-red-500/20' : 'border-white/10 hover:border-white/20'}`}
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-white/30 transition-colors hover:text-white/60"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* Error */}
            <div
              aria-live="polite"
              className={`mb-5 min-h-[1.25rem] transition-all duration-300 ${localError ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}
            >
              {localError && (
                <p className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-6.75v0M3.75 12h16.5" />
                  </svg>
                  {localError}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !username.trim() || !password.trim()}
              className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 outline-none ring-offset-2 ring-offset-[#0a0a1a] transition-all duration-200 hover:shadow-xl hover:shadow-violet-600/30 focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {/* Shimmer */}
              <span className="pointer-events-none absolute inset-0 -translate-x-full transition-transform duration-700 group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <span className="relative flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <SpinnerIcon />
                    Verificando…
                  </>
                ) : (
                  <>
                    <ShieldIcon />
                    Iniciar sesión
                  </>
                )}
              </span>
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/15">Zero-Trust</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
          </div>

          {/* Security badges */}
          <div className="flex items-center justify-center gap-5 text-white/20">
            <div className="flex items-center gap-1.5 text-[11px]">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.337 12.693 2 12.928" />
              </svg>
              Cifrado E2E
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
              Zero-Trust
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.412 15.655 9.75 21.001 8.088 15.655m-1.519 0L5.25 21l-1.662-5.345m1.519 0L4.5 10.701 9.75 9l5.25 1.701m-1.519 4.954L13.5 21l-1.662-5.345m-1.519 0L12 9l1.662 5.345" />
              </svg>
              PGP Compatible
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-[11px] text-white/15">
          © {new Date().getFullYear()} Crux Webmail — Seguridad de extremo a extremo
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────
function generateFingerprint(): string {
  const data = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth.toString(),
    new Date().getTimezoneOffset().toString(),
  ].join('|');
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const ch = data.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash).toString(36);
}

async function getPublicIp(): Promise<string | null> {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2000) });
    const json = await res.json();
    return json.ip ?? null;
  } catch {
    return null;
  }
}