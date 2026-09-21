import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.DEV_ALLOWED_ORIGINS?.split(',').map(host => host.trim()).filter(Boolean),
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Rewritten multipart requests otherwise truncate at Next's 10 MiB default.
  // The UI allows 500 MiB of files, leaving room for multipart headers here.
  experimental: { proxyClientMaxBodySize: "512mb", proxyTimeout: 120000 },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8000"}/api/:path*` }];
  },
  async headers() {
    return [{ source: "/share/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] }];
  },
};
export default nextConfig;
