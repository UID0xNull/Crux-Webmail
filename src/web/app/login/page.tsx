'use client';

import { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore, hydrateAuth } from 'lib/store/auth';
import type { ClientFingerprint } from 'lib/types';

/* ─── Icons (simple, no external lib) ────────────── */
function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8L10.89 13.26C11.2187 13.4793 11.6099 13.5886 12 13.5886C12.39 13.5886 12.7812 13.4793 13.11 13.26L21 8M7 10V19C7 20.1046 7.89543 21 9 21H15C16.1046 21 17 20.1046 17 19V10M3 8C3 6.89543 3.89543 6 5 6H19C20.1046 6 21 6.89543 21 8V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V8Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="3" />
      <path d="M4 21C4 17.134 7.13401 14 12 14C16.866 14 20 17.134 20 21" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="10" width="16" height="12" rx="3" />
      <path d="M9 10V7C9 4.79086 10.7909 3 13 3C15.2091 3 17 4.79086 17 7V10" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 12C6 7 9 5 12 5C15 5 18 7 21 12C18 17 15 19 12 19C9 19 6 17 3 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3L21 21" />
      <path d="M7 8C6.56173 9.15838 6 11 6 12C6 16.4183 9.58172 19 14 19" />
      <path d="M9 5C8.31581 5.09866 7 5.5 6 6C6 6 7.5 11 12 15C15 17.5 18.5 17.5 21 15" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <span className="spinner">Verificando…</span>
  );
}

/* ─── Suspense fallback ────────────── */
function LoginFallback() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
      <div style={{ textAlign:'center', color:'#9ca3af', fontSize:12, letterSpacing:0.5 }}>
        <span className="spinner" />
        <p style={{ marginTop:6, fontWeight:500 }}>Inicializando entorno…</p>
      </div>
    </div>
  );
}

/* ─── Login Form (core logic unchanged) ───────────── */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectParam = params.get('redirect');

  const { isAuthenticated, isLoading, error, login } = useAuthStore();

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
    setTimeout(() => inputRef.current?.focus(), 300);
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

  // Subtle entrance animation style
  const containerStyle = mounted
    ? { opacity: 1, transform: 'translateY(0)' }
    : { opacity: 0, transform: 'translateY(8px)' };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
      }}
    >
      <style>{`
        .login-root *,
        .login-root *::before,
        .login-root *::after {
          box-sizing: border-box;
        }

        @keyframes fade-up-in {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:translateY(0); }
        }

        .spinner {
          display:inline-block;
          width:16px; height:16px; border-radius:50%;
          border:2px solid rgba(75,85,99,0.35);
          borderTop-color:#6b46c1;
          animation: spin 0.9s linear infinite;
        }

        @keyframes spin { to{transform:rotate(360deg)} }

      `}</style>

      <div
        className="login-root"
        style={{
          width:'100%',
          maxWidth:'420px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro", system-ui, -system-ui, sans-serif',
          color:'#e5e7eb',
          background: 'radial-gradient(circle at top, #111827 0, #020617 40%, #010a15)',
          borderRadius: '999px',
          padding:'36px 28px',
          border:'1px solid rgba(75,85,99,0.35)',
          boxShadow:
            '0 40px 100px rgba(0,0,0,0.9), ' +
            '0 0 60px radial-gradient(circle at top left, rgba(79,70,229,0.35), transparent)',
          animation: 'fade-up-in 0.6s ease-out',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom:18 }}>
          <h1
            style={{
              fontSize:16,
              fontWeight:700,
              letterSpacing:0.3,
              color:'#e5e7eb',
              margin:0,
            }}
          >
            Inicia sesión en tu bandeja segura
          </h1>
        </div>

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} noValidate style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Username */}
          <label style={{ fontSize:10, textTransform:'uppercase', letterSpacing:1.2, color:'#9ca3af', fontWeight:600 }}>
            Usuario o correo
          </label>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', display:'inline-flex', color:'#9ca3af' }}>
              <UserIcon />
            </span>

            <input
              ref={inputRef}
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, username: true }))}
              placeholder="tu@ejemplo.com"
              disabled={isLoading}
              style={{
                width:'100%',
                padding:'10px 12px 10px 34px',
                fontSize:13,
                fontWeight:500,
                background:'#0b1020',
                color:'#e5e7eb',
                border: (touched.username && !username)
                  ? '1px solid rgba(239,68,68,0.7)'
                  : '1px solid rgba(75,85,99,0.4)',
                borderRadius: 8,
                outline:'none',
              }}
            />
          </div>

          {/* Password */}
          <label style={{ fontSize:10, textTransform:'uppercase', letterSpacing:1.2, color:'#9ca3af', fontWeight:600 }}>
            Contraseña
          </label>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', display:'inline-flex', color:'#9ca3af' }}>
              <LockIcon />
            </span>

            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              placeholder="••••••••"
              disabled={isLoading}
              style={{
                width:'100%',
                padding:'10px 36px 10px 34px',
                fontSize:13,
                fontWeight:500,
                background:'#0b1020',
                color:'#e5e7eb',
                border: (touched.password && !password)
                  ? '1px solid rgba(239,68,68,0.7)'
                  : '1px solid rgba(75,85,99,0.4)',
                borderRadius: 8,
                outline:'none',
              }}
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              style={{
                position:'absolute',
                right:10, top:'50%', transform:'translateY(-50%)',
                background:'none', border:'none', color:'#9ca3af',
                cursor:'pointer', padding:4, display:'inline-flex',
              }}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          {/* Error */}
          {localError && (
            <div
              style={{
                marginTop:-6,
                padding:'7px 9px',
                fontSize:10,
                color:'#fca5a5',
                background:'rgba(239,68,68,0.18)',
                borderRadius:6,
                display:'flex', gap:4, alignItems:'center',
              }}
            >
              <span style={{ fontSize:11 }}>!</span>
              {localError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || !username.trim() || !password.trim()}
            style={{
              marginTop:2,
              width:'100%',
              padding:'9px 12px',
              fontSize:11,
              fontWeight:600,
              color:'#ffffff',
              border:'none',
              borderRadius:8,
              cursor: (isLoading || !username.trim() || !password.trim()) ? 'not-allowed' : 'pointer',
              background:
                'linear-gradient(90deg,' +
                  '#6b46c1 0%, #7c3aed 25%, #6d28d9 50%, #4f46e5 75%, #22c9fd 100%)',
              boxShadow: '0 14px 40px rgba(37,99,235,0.35)',
              opacity: (isLoading || !username.trim() || !password.trim()) ? 0.6 : 1,
            }}
          >
            {isLoading ? <SpinnerIcon /> : 'Iniciar sesión'}
          </button>
        </form>

        {/* Subtle security footer */}
        <p
          style={{
            marginTop:14,
            fontSize:8,
            letterSpacing:2,
            textTransform:'uppercase',
            color:'#6b7280',
            display:'flex', alignItems:'center', justifyContent:'center', gap:4,
          }}
        >
          <span>Seguro</span>
          <span style={{ opacity:0.5 }}>·</span>
          <span>Zerotrusted</span>
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