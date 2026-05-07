// ============================================================================
// Crux-Webmail — Next.js Config (Optimized for v1.0.0)
// ============================================================================
// Optimizations applied:
// - Image optimization (WebP/AVIF, responsive sizes)
// - Compression (Gzip/Brotli) for all assets
// - Modular server config for memory/performance tuning
// - Tree-shaking: no unnecessary polyfills
// - Experimental turbopack for dev speed
// - Standalone output for Docker
// ============================================================================

import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Standalone output for Docker
  output: 'standalone',

  // Transpile shared packages
  transpilePackages: [],

  // ------------------------------------------------------------------
  // Image Optimization
  // ------------------------------------------------------------------
  images: {
    formats: ['image/avif', 'image/webp'],
    devices: [640, 768, 1024, 1280, 1536, 1920],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: false,
    enableBasicAuthorization: false,
  },

  // ------------------------------------------------------------------
  // Compression — Gzip + Brotli for all responses
  // ------------------------------------------------------------------
  compress: true,

  // ------------------------------------------------------------------
  // Modular Server — fine-tune Node.js memory/performance
  // ------------------------------------------------------------------
  serverRuntimeConfig: {
    apiRateLimit: 100,
    apiTimeout: 30000,
  },

  serverBundleDependencies: isProd ? false : undefined,

  // ------------------------------------------------------------------
  // Experimental — TurboPack for dev, PPR for streaming
  // ------------------------------------------------------------------
  experimental: {
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.tsx',
        },
      },
    },
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
            value: `
              default-src 'self';
              script-src 'self' 'strict-dynamic';
              style-src 'self' 'unsafe-inline';
              img-src 'self' data: blob:;
              font-src 'self';
              connect-src 'self' https://api.crux.internal;
              frame-src 'none';
              object-src 'none';
              base-uri 'self';
              form-action 'self';
              media-src 'self';
              worker-src 'self';
              child-src 'self';
            `.replace(/\s+/g, ' ').trim(),
          },
          // Cache static assets aggressively
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