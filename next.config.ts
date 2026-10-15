import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: __dirname },
  devIndicators: { position: "bottom-right" },
  poweredByHeader: false,
  serverExternalPackages: [],
  images: { formats: ["image/avif", "image/webp"], qualities: [60, 75, 90] },
  experimental: { optimizePackageImports: ["@phosphor-icons/react", "date-fns", "motion"] },
};

export default config;
