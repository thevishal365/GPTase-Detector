import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides the bottom-left Next.js devtools indicator during development.
  devIndicators: false,
  rewrites: async () => {
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: "http://127.0.0.1:8000/api/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
