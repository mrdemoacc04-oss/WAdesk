import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Baseline browser hardening. A strict Content-Security-Policy is a worthwhile follow-up, but it needs a nonce setup
// to coexist with Next's inline scripts and the Supabase / WhatsApp media origins (see Next's content-security-policy guide).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const config: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: __dirname },
  devIndicators: { position: "bottom-right" },
  poweredByHeader: false,
  serverExternalPackages: [],
  images: { formats: ["image/avif", "image/webp"], qualities: [60, 75, 90] },
  experimental: { optimizePackageImports: ["@phosphor-icons/react", "date-fns", "motion"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
