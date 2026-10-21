import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Permite abrir el servidor de desarrollo con 127.0.0.1 (otro jar de cookies que localhost).
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
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
