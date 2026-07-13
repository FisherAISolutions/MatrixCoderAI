import { imageHosts } from './image-hosts.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  distDir: process.env.DIST_DIR || '.next',

  typescript: {
    ignoreBuildErrors: false,
  },

  eslint: {
    // Keep lint as an explicit CI/developer check for now. The repo has
    // existing Prettier line-ending debt that should be cleaned in a
    // dedicated pass before lint is enforced inside the production build.
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
  },

  // Phase 1 — Build Validation + Auto-Fix Loop.
  //
  // WebContainer (StackBlitz) requires the page to be cross-origin
  // isolated so SharedArrayBuffer is available. These two headers are
  // the minimum required:
  //   - COOP: same-origin       → isolates the browsing context group
  //   - COEP: require-corp      → requires all subresources to be CORP-tagged
  //
  // We scope the headers to /chat-workspace (the only route that uses
  // WebContainer) so the rest of the app continues to embed third-party
  // resources (auth screenshots, analytics, etc.) without breaking.
  async headers() {
    return [
      {
        source: '/chat-workspace/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      {
        source: '/chat-workspace',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      // 2026-01 cache-bust pass — older builds of this project shipped a
      // 307 redirect from `/` to `/sign-up-login-screen`. Browsers
      // (notably Chrome + Firefox) cache 307s aggressively for the
      // session, so users who visited the old build keep getting
      // bounced to /sign-up-login-screen even after the redirect was
      // removed from this config. Forcing `no-store` on the new
      // landing route guarantees the browser revalidates the actual
      // server response every time, dropping any stale cached redirect.
      {
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https: wss: blob:",
              "worker-src 'self' blob:",
              "frame-src 'self' https:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },

  // 2026-01 — landing page is now served from `/` (src/app/page.tsx).
  // Previous behaviour redirected `/` straight to /sign-up-login-screen
  // which made it impossible to ever show a marketing site. Removed.
};
export default nextConfig;


