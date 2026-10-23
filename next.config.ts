import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-mode "N" badge sits bottom-left, on top of the practice exam's End Review / Review Screen buttons
  devIndicators: false,
  experimental: {
    // Trades a little compile speed for less memory; the dev VM is small and Next dev restarts near its heap limit
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
