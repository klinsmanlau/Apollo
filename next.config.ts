import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions are stable in Next 15; kept explicit for clarity.
  },
};

export default nextConfig;
