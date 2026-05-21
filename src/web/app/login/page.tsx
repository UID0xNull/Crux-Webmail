'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore, hydrateAuth } from 'lib/store/auth';
import type { ClientFingerprint } from 'lib/types';

/* ─── Icons (simple, no external lib) ────────────── */
function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8L10.89 13.26C11.2187 13.4793 11.6099 13.5886 12 13.5886C12.39 13.5886 12.7812 13.4793 13.11 13.26L21 8M7 10V19C7 20.1046 7.89543 21 9 21H15C16.1046 21 17 20.1046 17 19V10M3 8C3 6.89543 3.89543 6 5 6H19C20.1046 6 21 6.89543 21 8V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V8Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="3" />
      <path d="M4 21C4 17.134 7.13401 14 12 14C16.866 14 20 17.134 20 21" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="10" width="16" height="12" rx="3" />
      <path d="M9 10V7C9 4.79086 10.7909 3 13 3C15.2091 3 17 4.79086 17 7V10" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 12C6 7 9 5 12 5C15 5 18 7 21 12C18 17 15 19 12 19C9 19 6 17 3 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 3L21 21" />
      <path d="M7 8C6.56173 9.15838 6 11 6 12C6 16.4183 9.58172 19 14 19" />
      <path d="M9 5C8.31581 5.09866 7 5.5 6 6C6 6 7.5 11 12 15C15 17.5 18.5 17.5 21 15" />
    </svg>
  );
}

function SpinnerIcon() {
  return <span className="login-spinner" />;
}

/* ─── Suspense fallback ────────────── */
function LoginFallback() {
  return (
    <div style={{ minHeight:'100vh', width:'100%', boxSizing:'border-box', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .login-fb-spinner{width:18px;height:18px;border-radius:50%;border:2px solid rgba(75,85,99,0.4);border-top-color:#6b46c1;animation:spin 0.9s linear infinite;display:inline-block}
      `}</style>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, color:'#cbd5e1', fontFamily:'system-ui,-apple-system,BlinkMacSystemFont,sans-serif' }}>
        <span className="login-fb-spinner" />
        <p style={{ margin:0, fontSize:13, fontWeight:500, letterSpacing:0.3 }}>Inicializando entorno…</p>
      </div>
    </div>
  );
}

/* ─── Login Form (core logic unchanged; UI overhauled) ─── */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectParam = params.get('redirect');

  const { isAuthenticated, isLoading, error, login } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Hydrate + fingerprint (unchanged) */
  useEffect(() => {
    (async () => { await hydrateAuth(); })();

    const fp: ClientFingerprint = {
      browser: navigator.userAgent.split(' ')[0],
      os: navigator.platform,
      screen: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      languages: navigator.languages,
      hash: generateFingerprint(),
    };
    useAuthStore.getState().updateFingerprint(fp);

    setTimeout(() => inputRef.current?.focus(), 350);
  }, []);

  /* Redirect if authenticated (unchanged) */
  useEffect(() => {
    if (isAuthenticated) {
      router.replace(redirectParam || '/dashboard/inbox');
    }
  }, [isAuthenticated, router, redirectParam]);

  /* Sync error (unchanged) */
  useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLocalError(null);

      if (!username.trim() || !password.trim()) {
        setLocalError('Completa todos los campos para continuar.');
        return;
      }
      if (password.length < 8) {
        setLocalError('La contraseña debe tener al menos 8 caracteres.');
        return;
      }

      const fp = useAuthStore.getState().fingerprint;

      const success = await login({
        username: username.trim(),
        password,
        device_fingerprint: {
          browser: fp?.browser ?? navigator.userAgent.slice(0, 200),
          os: fp?.os ?? navigator.platform,
          screen: fp?.screen ?? `${screen.width}x${screen.height}`,
          timezone: fp?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          languages: Array.from(fp?.languages ?? navigator.languages),
        },
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
    <div className="login-root">
      {/* Global styles for login page only */}
      <style>{`
        .login-root *,
        .login-root *::before,
        .login-root *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        @keyframes fade-up-in {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Main layout */
        .login-root {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #020817;
          color: #e5e7eb;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
          position: relative;
          overflow: hidden;
        }

        /* Background ambient gradients */
        .login-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }
        .login-bg-orb1 {
          position: absolute;
          top: -24%; left: -15%;
          width: 70vw; height: 65vh;
          background: radial-gradient(circle at center, rgba(37,99,235,0.22), transparent);
          filter: blur(50px);
        }
        .login-bg-orb2 {
          position: absolute;
          bottom: -18%; right: -15%;
          width: 75vw; height: 65vh;
          background: radial-gradient(circle at center, rgba(147,51,234,0.24), transparent);
          filter: blur(52px);
        }
        .login-bg-soft {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at top left, rgba(79,70,229,0.16), transparent)
              top left no-repeat,
            radial-gradient(circle at bottom right, rgba(56,189,248,0.09), transparent)
              bottom right no-repeat;
        }

        /* Card */
        .login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 436px;
          padding: 28px 27px 20px;
          border-radius: 19px;
          background-color: rgba(15,23,42,0.9);
          backdrop-filter: blur(26px) saturate(150%);
          -webkit-backdrop-filter: blur(26px) saturate(150%);
          border: solid 1px rgba(75,85,99,0.45);
          box-shadow:
            0 30px 90px rgba(0,0,0,1),
            0 0 60px radial-gradient(circle at top left, rgba(79,70,229,0.3), transparent);
          animation: fade-up-in 0.6s ease-out;
        }

        /* Header */
        .login-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 2px;
        }
        .login-logo-mark {
          width: 24px; height: 24px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg,#4f46e5,#7c3aed);
          color: #ffffff;
        }
        .login-brand {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #e5e7eb;
        }
        .login-title {
          margin-top: 6px;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 0.18px;
          color: #f9fafb;
        }
        .login-subtitle {
          margin-top: 3px;
          font-size: 13px;
          color: #cbd5e1;
        }

        /* Form */
        .login-form {
          margin-top: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        /* Fields */
        .login-field-label {
          display: block;
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #9ca3af;
          margin-bottom: 4px;
        }

        .login-input-wrap { position: relative; }

        .login-input {
          width: 100%;
          padding: 9px 10px 9px 32px;
          font-size: 13px;
          color: #e5e7eb;
          background-color: rgba(15,23,42,0.96);
          border-radius: 9px;
          border: solid 1px rgba(75,85,99,0.7);
          outline: none;
          transition: all 0.2s ease-out;
        }
        .login-input::placeholder { color: #6b7280; font-size: 13px; }

        .login-input:focus {
          border-color: rgba(99,102,241,0.95);
          box-shadow: 0 10px 30px rgba(79,70,229,0.16);
        }

        .login-input-icon {
          position: absolute;
          left: 8px; top: 50%; transform: translateY(-50%);
          color: #6b7280;
          pointer-events: none;
          display: inline-flex;
        }

        .login-eye-btn {
          position: absolute; right: 7px; top: 50%; transform: translateY(-50%);
          padding: 3px;
          background: none; border: none; color: #9ca3af; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
          outline: none;
        }

        /* Error */
        .login-error {
          margin-top: -6px;
          padding: 7px 8px;
          font-size: 10px;
          color: #fecaca;
          background-color: rgba(239,68,68,0.14);
          border-radius: 8px;
          display: flex; gap: 6px; align-items: center;
        }

        /* Button */
        .login-btn {
          margin-top: 4px;
          width: 100%;
          padding: 9px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #ffffff;
          border: none;
          border-radius: 9px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg,#4f46e5 0%,#7c3aed 45%,#38bdf8 100%);
          box-shadow: 0 12px 38px rgba(79,70,229,0.34);
          transition: transform 0.06s ease-out, box-shadow 0.15s ease-out;
        }

        .login-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 18px 48px rgba(79,70,229,0.44);
        }

        .login-btn:active {
          transform: scale(0.985);
        }

        .login-btn:disabled {
          opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none;
        }

        /* Spinner */
        .login-spinner {
          display: inline-block;
          width: 13px; height: 13px;
          border-radius: 50%;
          border: 2px solid rgba(148,163,253,0.2);
          border-top-color: #e5e7eb;
          animation: spin 0.9s linear infinite;
        }

        /* Footer */
        .login-footer {
          margin-top: 9px;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 7px; letter-spacing: 1.35px; text-transform: uppercase;
          color: #6b7280;
        }

      `}</style>

      {/* Background */}
      <div className="login-bg">
        <div className="login-bg-orb1" />
        <div className="login-bg-orb2" />
        <div className="login-bg-soft" />
      </div>

      {/* Card */}
      <div className="login-card">
        {/* Brand header */}
        <div className="login-header">
          <div className="login-logo-mark">
            <MailIcon />
          </div>
          <span className="login-brand">CruxWebmail</span>
        </div>

        <h1 className="login-title">Inicia sesión en tu bandeja segura</h1>
        <p className="login-subtitle">Correo cifrado con acceso de confianza cero.</p>

        {/* Form */}
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate className="login-form">
          {/* Username / Email */}
          <div>
            <label className="login-field-label" htmlFor="login-user">
              Usuario o correo
            </label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <UserIcon />
              </span>
              <input
                ref={inputRef}
                id="login-user"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="tu@ejemplo.com"
                disabled={isLoading}
                className="login-input"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="login-field-label" htmlFor="login-pass">
              Contraseña
            </label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <LockIcon />
              </span>
              <input
                id="login-pass"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                className="login-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="login-eye-btn"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {/* Error */}
          {localError && (
            <div className="login-error">
              <span style={{ fontSize: 9 }}>!</span>{localError}
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={isLoading || !username.trim() || !password.trim()} className="login-btn">
            {isLoading ? <SpinnerIcon /> : 'Iniciar sesión'}
          </button>
        </form>

        {/* Footer trustline */}
        <div className="login-footer">
          <span>Cifrado de extremo a extremo</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>Zero-trust</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Page wrapper with Suspense (unchanged) ───────────── */
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

