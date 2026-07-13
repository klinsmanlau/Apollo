import type { NextConfig } from "next";

// Origins allowed to embed Apollo in an <iframe> (e.g. the qa_dashboard
// "Test Cases" section). Set DASHBOARD_ORIGIN to the dashboard's URL, e.g.
// https://qa.yourdomain.com. Localhost is included for local dev.
const frameAncestors = [
  "'self'",
  process.env.DASHBOARD_ORIGIN,
  "http://localhost:8000",
]
  .filter(Boolean)
  .join(" ");

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions are stable in Next 15; kept explicit for clarity.
  },
  async headers() {
    // Permit framing from the dashboard origin via CSP frame-ancestors.
    // We intentionally do NOT set X-Frame-Options (legacy; it can't express
    // an allow-list and would override frame-ancestors with same-origin only).
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${frameAncestors};`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
