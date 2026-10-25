import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-mode "N" badge sits bottom-left, on top of the practice exam's End Review / Review Screen buttons
  devIndicators: false,
  experimental: {
    // Less memory for webpack builds (next build). Dev uses Turbopack (package.json), which keeps compiled code
    // off the JS heap, so the small dev VM no longer hits Next dev's restart-near-heap-limit
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
