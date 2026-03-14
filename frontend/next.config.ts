import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config) => {
    // Polyfills needed for @solana/web3.js in browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: false,
      stream: false,
      http: false,
      https: false,
      zlib: false,
      url: false,
    };
    
    return config;
  },
};

export default nextConfig;
