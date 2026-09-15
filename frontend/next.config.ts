import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    return [{ source: "/api/public/:path*", destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8000"}/api/public/:path*` }];
  },
  async headers() {
    return [{ source: "/share/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] }];
  },
};
export default nextConfig;
