// ============================================================================
// Crux-Webmail Frontend — Client Fingerprint
// Zero-Trust: every auth request carries a verifiable browser fingerprint
// ============================================================================

import type { ClientFingerprint } from '../types';
import { E2EEngine } from './engine';

export async function computeFingerprint(): Promise<ClientFingerprint> {
  const browserInfo = parseBrowser(navigator.userAgent);

  const components = [
    browserInfo.name,
    browserInfo.version,
    navigator.userAgent,
    navigator.language,
    navigator.languages?.join(',') ?? '',
    screen.width.toString(),
    screen.height.toString(),
    screen.colorDepth.toString(),
    window.devicePixelRatio?.toString() ?? '1',
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() ?? '',
    navigator.deviceMemory?.toString() ?? '',
    // Canvas fingerprint
    await getCanvasHash(),
    // WebGL fingerprint
    await getWebGLHash(),
  ];

  const raw = components.join('\u0000');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashHex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    browser: browserInfo.name,
    os: browserInfo.os,
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    languages: navigator.languages || [navigator.language],
    hash: hashHex,
  };
}

// ------------------------------------------------------------------
// Canvas fingerprint — deterministic hash of canvas render
// ------------------------------------------------------------------
async function getCanvasHash(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';

    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Crux-Zero-Trust', 2, 2);
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Webmail', 2, 20);

    const data = canvas.toDataURL();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  } catch {
    return 'no-canvas';
  }
}

// ------------------------------------------------------------------
// WebGL renderer fingerprint
// ------------------------------------------------------------------
async function getWebGLHash(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
    if (!gl) return 'no-webgl';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'no-debug-info';

    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);

    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(renderer + vendor)
    );
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  } catch {
    return 'no-webgl';
  }
}

// ------------------------------------------------------------------
// Browser / OS detection
// ------------------------------------------------------------------
function parseBrowser(ua: string): { name: string; version: string; os: string } {
  // OS detection
  const osMatch = ua.match(/(Windows NT|Mac OS X|Linux|Android|iPhone)/);
  const os = osMatch?.[1] ?? 'Unknown';

  // Browser detection
  let name = 'Unknown';
  let version = '0';

  if (/Edg/i.test(ua)) {
    name = 'Edge';
  } else if (/OPR|Opera/i.test(ua)) {
    name = 'Opera';
  } else if (/Chrome/i.test(ua)) {
    name = 'Chrome';
  } else if (/Firefox/i.test(ua)) {
    name = 'Firefox';
  } else if (/Safari/i.test(ua)) {
    name = 'Safari';
  }

  const verMatch = ua.match(/(Edg|OPR|Chrome|Firefox|Safari)\/[\d.]+/);
  if (verMatch) {
    version = verMatch[0].split('/')[1].split('.')[0];
  }

  return { name, version, os };
}

// ------------------------------------------------------------------
// Persist fingerprint hash in sessionStorage (no persistence between tabs)
// ------------------------------------------------------------------
const FINGERPRINT_KEY = 'crux_fingerprint_hash';

export async function getOrComputeFingerprint(): Promise<string> {
  if (typeof window === 'undefined') return 'server-side-render';

  const cached = sessionStorage.getItem(FINGERPRINT_KEY);
  if (cached) return cached;

  const fp = await computeFingerprint();
  sessionStorage.setItem(FINGERPRINT_KEY, fp.hash);
  return fp.hash;
}

export async function getFingerprintData(): Promise<ClientFingerprint> {
  return computeFingerprint();
}
---CODE---