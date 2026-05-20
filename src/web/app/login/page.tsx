'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore, hydrateAuth } from 'lib/store/auth';
import type { ClientFingerprint } from 'lib/types';

/* ─── Icons (minimal, clean, futuristic) ────────────────────── */
function MailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
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

function ShieldIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

/* ─── Suspense fallback (minimal, immersive) ──────────────── */
function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-[2px] border-violet-500/30 border-t-cyan-400" />
        <p className="mt-2 text-xs tracking-wide text-white/25">Inicializando entorno…</p>
      </div>
    </div>
  );
}

/* ─── Login Form (core logic unchanged) ───────────────────── */
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
    setTimeout(() => inputRef.current?.focus(), 600);
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

  /* Inline keyframes for login card */
  return (
    <>
      <style>{`
        @keyframes fade-up-in {
          from { opacity:0; transform:translateY(18px) scale(.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes soft-glow-pulse {
          0%,100% { box-shadow:0 24px 60px rgba(5,5,23,.7), 0 0 38px rgba(99,45,255,.12); }
          50%     { box-shadow:0 30px 80px rgba(5,5,23,.9), 0 0 60px rgba(37,99,235,.2); }
        }
      `}</style>

      <div
        className="min-h-screen w-full px-4 py-12"
      >
        {/* Main card container */}
        <div
          style={{ animation: 'fade-up-in 0.7s ease-out' }}
          className={`mx-auto w-full max-w-md transition-all duration-700 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
        >
          {/* Brand header */}
          <div className="mb-8 text-center">
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-lg shadow-violet-600/25 ring-1 ring-white/20 backdrop-blur"
            >
              <div className="text-white drop-shadow">
                <MailIcon />
              </div>
            </div>

            <h1
              className="bg-gradient-to-r from-blue-100 via-fuchsia-50 to-cyan-50 bg-clip-text text-[2rem] leading-tight font-extrabold tracking-tight text-transparent"
            >
              Crux Webmail
            </h1>

            <p className="mt-1.5 text-xs tracking-wide text-white/30">
              Inicia sesión en tu bandeja segura
            </p>
          </div>

          {/* Glass card */}
          <div
            style={{ animation: 'soft-glow-pulse 5s ease-in-out infinite' }}
            className="relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-black/40 p-7 shadow-2xl backdrop-blur-xl"
          >
            {/* Subtle gradient rim */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent opacity-70"
            />

            <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate>
              {/* Username field */}
              <div className="mb-4">
                <label
                  htmlFor="username"
                  className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-300/70"
                >
                  Usuario o correo
                </label>

                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-violet-300/60">
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
                    placeholder="tu@ejemplo.com"
                    disabled={isLoading}
                    className={`w-full rounded-xl border bg-black/30 px-4 py-3.5 pl-12 pr-4 text-sm font-medium text-white outline-none transition-all duration-200 
                      focus:border-cyan-400/60 focus:ring-[0] focus:bg-black/40 placeholder:text-white/20
                      ${touched.username && !username
                        ? 'border-red-400/50 shadow-[0_0_18px_rgba(239,68,68,0.15)]'
                        : 'border-white/10 hover:border-white/20'}
                      focus:shadow-[0_0_26px_rgba(34,211,238,0.15)]
                    `}
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="mb-5">
                <label
                  htmlFor="password"
                  className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.25em] text-fuchsia-300/70"
                >
                  Contraseña
                </label>

                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-violet-300/60">
                    <LockIcon />
                  </div>

                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    placeholder="••••••••"
                    disabled={isLoading}
                    className={`w-full rounded-xl border bg-black/30 px-4 py-3.5 pl-12 pr-12 text-sm font-medium text-white outline-none transition-all duration-200 
                      focus:border-fuchsia-400/60 focus:ring-[0] focus:bg-black/40 placeholder:text-white/20
                      ${touched.password && !password
                        ? 'border-red-400/50 shadow-[0_0_18px_rgba(239,68,68,0.15)]'
                        : 'border-white/10 hover:border-white/20'}
                      focus:shadow-[0_0_26px_rgba(217,70,239,0.15)]
                    `}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-white/25 transition-colors hover:text-cyan-300/90 active:scale-[0.97]"
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
                className={`mb-5 min-h-[20px] transition-all duration-300 ${localError ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'}`}
              >
                {localError && (
                  <p className="flex items-center gap-2 rounded-lg border border-red-500/15 bg-red-600/10 px-3.5 py-2 text-[11px] font-medium tracking-wide text-red-200">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500/20 text-xs leading-none">!</span>
                    {localError}
                  </p>
                )}
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading || !username.trim() || !password.trim()}
                className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500 py-3.5 text-xs font-semibold tracking-wide text-white shadow-lg shadow-purple-950/40 outline-none transition-all duration-200 
                  hover:shadow-[0_18px_48px_rgba(99,45,255,0.3)]
                  active:scale-[0.97]
                  focus-visible:ring-2 focus-visible:ring-cyan-400
                  disabled:pointer-events-none disabled:opacity-40"
              >
                {/* Hover shimmer */}
                <span className="pointer-events-none absolute inset-y-0 -left-full top-0 h-full w-[180%] bg-gradient-to-r from-transparent via-white/15 to-transparent [transform:skewX(-16deg)] transition-transform duration-700 group-hover:[transform:translate3d(45%,0,0)_skewX(-16deg)]" />

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
            <div className="my-5 flex items-center gap-3">
              <div className="h-[1px] w-full bg-gradient-to-r from-transparent to-cyan-400/25" />
              <span className="text-[9px] font-medium uppercase tracking-[0.25em] text-white/20">Zero-Trust</span>
              <div className="h-[1px] w-full bg-gradient-to-l from-transparent to-fuchsia-400/25" />
            </div>

            {/* Security badges */}
            <div className="flex items-center justify-center gap-5 text-white/18">
              {[
                ['E2EE', 'Cifrado E2E'],
                ['ZT', 'Zero-Trust'],
                ['PGP', 'PGP Compatible'],
              ].map(([label, title]) => (
                <div key={title} className="group/badge relative flex items-center gap-1.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[9px] font-bold uppercase tracking-wide text-cyan-200/70" title={title}>
                    {label}
                  </span>

                  {/* tiny tooltip on hover */}
                  <span className="absolute -bottom-6 left-1/2 z-30 hidden whitespace-nowrap rounded-md border border-white/15 bg-black/90 px-2 py-1 text-[10px] font-medium tracking-wide text-cyan-200 group-hover/badge:block" style={{ transform: 'translateX(-50%)' }}>
                    {title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-[10px] tracking-wide text-white/15">
            © {new Date().getFullYear()} Crux Webmail — Seguridad de extremo a extremo
          </p>
        </div>
      </div>
    </>
  );
}

/* ─── Page wrapper with Suspense ──────────────────────── */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

/* ─── Helpers (unchanged logic) ─────────────────────────── */
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