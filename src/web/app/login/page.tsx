'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore, hydrateAuth } from 'lib/store/auth';
import type { ClientFingerprint } from 'lib/types';

/* ─── Icons (minimal) ────────────────────── */
function MailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0V10.5m13.5 0v9a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5v-9m13.5-2.25H6.75" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.77m-6.227 0a10.522 10.522 0 0 0 3.846 1.392" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12.178 6.752l4.093 4.093" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ─── Suspense fallback (clean, calm) ────────────── */
function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-[2px] border-cyan-500/30 border-t-cyan-400" />
        <p className="mt-1 text-xs tracking-wide text-slate-400">Inicializando entorno…</p>
      </div>
    </div>
  );
}

/* ─── Login Form (logic unchanged, UI cleaned) ── */
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

  /* Hydrate + fingerprint */
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
    setTimeout(() => inputRef.current?.focus(), 400);
  }, []);

  /* Redirect if authenticated */
  useEffect(() => {
    if (isAuthenticated && mounted) {
      router.replace(redirectParam || '/dashboard/inbox');
    }
  }, [isAuthenticated, router, mounted, redirectParam]);

  /* Sync error */
  useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

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

  return (
    <div className="flex min-h-screen w-full items-center justify-center px-4 py-12">
      <style>{`
        @keyframes fade-up-in {
          from { opacity:0; transform:translateY(16px) scale(.98); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
      `}</style>

      <div
        style={{ animation: 'fade-up-in 0.5s ease-out' }}
        className={`w-full max-w-md transition-all duration-600 ${mounted ? 'opacity-100 translate-y-0' : 'translate-y-3 opacity-0'}`}
      >
        {/* Brand header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/90 to-cyan-400 text-white shadow-md shadow-indigo-950/40">
            <MailIcon />
          </div>

          <div className="flex flex-col">
            <h1 className="text-xl font-semibold tracking-tight text-slate-50">
              Crux Webmail
            </h1>
            <p className="mt-px text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Inicia sesión en tu bandeja segura
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="relative overflow-hidden rounded-xl border border-white/[0.12] bg-[#06070d]/95 shadow-2xl shadow-black backdrop-blur">
          {/* Top accent line, subtle */}
          <div aria-hidden className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />

          <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate>
            {/* Username field */}
            <div className="mb-4">
              <label htmlFor="username" className="block text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                Usuario o correo
              </label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-violet-300/80">
                  <UserIcon />
                </span>

                <input
                  ref={inputRef}
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                  placeholder="tu@ejemplo.com"
                  disabled={isLoading}
                  className={`w-full rounded-lg border bg-[#020617] px-3 py-2.5 pl-9 text-sm font-medium text-slate-100 outline-none transition-all duration-180 
                    focus:ring-cyan-500/40 placeholder:text-slate-500
                    ${touched.username && !username
                      ? 'border-red-400/60 ring-1 ring-red-500/30'
                      : 'border-white/[0.12] focus:border-cyan-400'} `}
                />
              </div>
            </div>

            {/* Password field */}
            <div className="mb-5">
              <label htmlFor="password" className="block text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                Contraseña
              </label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-violet-300/80">
                  <LockIcon />
                </span>

                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  placeholder="••••••••"
                  disabled={isLoading}
                  className={`w-full rounded-lg border bg-[#020617] px-3 py-2.5 pl-9 pr-11 text-sm font-medium text-slate-100 outline-none transition-all duration-180 
                    focus:ring-fuchsia-500/40 placeholder:text-slate-500
                    ${touched.password && !password
                      ? 'border-red-400/60 ring-1 ring-red-500/30'
                      : 'border-white/[0.12] focus:border-fuchsia-400'} `}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition-colors hover:text-cyan-300 active:scale-[0.97]"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* Inline error */}
            <div
              aria-live="polite"
              className={`min-h-[20px] mb-5 transition-all duration-200 ${localError ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'} `}
            >
              {localError && (
                <p className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-950/40 px-3 py-1.5 text-[11px] font-medium tracking-wide text-red-200">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500/70 text-xs leading-none">!</span>
                  {localError}
                </p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading || !username.trim() || !password.trim()}
              className="group relative w-full overflow-hidden rounded-lg bg-gradient-to-r from-violet-600 to-cyan-500 py-2.5 text-[11px] font-semibold tracking-wide text-white shadow-lg shadow-indigo-900/40 outline-none transition-all duration-200 
                hover:shadow-[0_14px_38px_rgba(79,70,229,0.35)]
                active:scale-[0.97]
                focus-visible:ring-2 focus-visible:ring-cyan-400
                disabled:pointer-events-none disabled:opacity-40"
            >
              <span className="relative flex items-center justify-center gap-1.5">
                {isLoading ? (
                  <>
                    <SpinnerIcon />
                    Verificando…
                  </>
                ) : (
                  'Iniciar sesión'
                )}
              </span>
            </button>
          </form>

          {/* Subtle security note */}
          <div className="mt-3 flex items-center gap-2 px-1 text-[9px] font-medium uppercase tracking-widest text-slate-500">
            <span>Cifrado de extremo a extremo</span>
            <span className="text-slate-700">·</span>
            <span>Zero-trust</span>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-[10px] tracking-wide text-slate-600">
          © {new Date().getFullYear()} Crux Webmail
        </p>
      </div>
    </div>
  );
}

/* ─── Page wrapper with Suspense ──────────────── */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

/* ─── Helpers (unchanged logic) ─────────────────── */
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