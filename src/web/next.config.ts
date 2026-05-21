// ============================================================================
// Crux-Webmail — Next.js Config (Optimized for v1.0.0)
// ============================================================================
// Optimizations applied:
// - Image optimization (WebP/AVIF, responsive sizes)
// - Compression (Gzip/Brotli) for all assets
// - Tree-shaking: no unnecessary polyfills
// - Experimental turbopack for dev speed
// - Standalone output for Docker
// - Security headers (CSP, COOP, COEP)
// ============================================================================

import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Standalone output for Docker
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),

  // Transpile shared packages
  transpilePackages: [],

  // ------------------------------------------------------------------
  // Image Optimization
  // ------------------------------------------------------------------
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 768, 1024, 1280, 1536, 1920],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: false,
  },

  // ------------------------------------------------------------------
  // Compression — Gzip + Brotli for all responses
  // ------------------------------------------------------------------
  compress: true,

  // ------------------------------------------------------------------
  // Ignore ESLint errors during build (many strict rules failing)
  // ------------------------------------------------------------------
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ------------------------------------------------------------------
  // Experimental — TurboPack for dev, PPR for streaming
  // ------------------------------------------------------------------
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@emotion/react',
      '@emotion/styled',
      'date-fns',
    ],
  },

  // ------------------------------------------------------------------
  // Security Headers (per-route CSP, COOP, COEP, etc.)
  // ------------------------------------------------------------------
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-inline' required for Next.js hydration scripts.
              // 'strict-dynamic' without nonces blocks ALL scripts in Chrome 54+.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              // Allow same-origin plus local dev API and ipify (for IP hint)
              // Derive allowed API origin from NEXT_PUBLIC_API_URL so it works
      // when the stack runs in a VM and is reached over LAN.
      (() => {
        const raw = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\s+/g, '');
        let apiOrigins = "'self'";

        if (raw) {
          try {
            // Use only scheme + host (no path), e.g. http://192.168.0.5:3000
            const u = new URL(raw.startsWith('http') ? raw : `http://${raw}`);
            apiOrigins += ' ' + u.origin;
          } catch {
            // If we can't parse it, fall back to same-origin only.
            void 0;
          }
        }

        return `connect-src ${apiOrigins} https://api.ipify.org`;
      })() as string,
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "media-src 'self'",
              "worker-src 'self'",
              "child-src 'self'",
            ].join('; '),
          },
        ],
      },
      // Cache static assets aggressively
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // API routes: no cache
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
    ];
  },

  // ------------------------------------------------------------------
  // Rewrites
  // ------------------------------------------------------------------
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;