import type { NextConfig } from "next";

// Security headers applied to every response. CSP allows what Next needs
// (inline styles from Tailwind, inline/eval scripts for the dev/runtime),
// self-only connections for our SSE, https images (Roblox avatars), and
// blocks framing/embedding. Tighten script-src with nonces later if desired.
const isProd = process.env.NODE_ENV === "production";

const csp = [
  "default-src 'self'",
  // blob: is required for local previews of attached reference images.
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Isolate the browsing context and refuse Flash/Silverlight-era policies.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in the user profile directory
  // otherwise makes Turbopack infer the wrong root.
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // API responses can carry session/plugin tokens — never cache them
      // anywhere, and keep the whole API + admin surface out of search.
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
      {
        source: "/admin",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};

export default nextConfig;
