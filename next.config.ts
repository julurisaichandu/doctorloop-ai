import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optional separate build dir (lets several dev servers run side by side during development).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Classic dynamic rendering: every dashboard is per-user and reads the session cookie.
  // (Cache Components is intentionally not enabled for this prototype.)
  serverExternalPackages: ["@mastra/core"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
