import type { NextConfig } from "next";

// Server-side only: the browser always calls the relative /api/* routes,
// which Next.js rewrites to the FastAPI backend. BACKEND_URL is read here
// (never NEXT_PUBLIC_*) so the backend address stays server-side.
// Local dev without BACKEND_URL -> http://127.0.0.1:8000
// Production (Vercel) with BACKEND_URL -> public Cloud Run URL
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Hides the bottom-left Next.js devtools indicator during development.
  devIndicators: false,
  rewrites: async () => {
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
