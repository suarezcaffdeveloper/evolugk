import type { NextConfig } from "next";

// Cabeceras de seguridad para todas las rutas. La política de contenido (CSP) va aparte: necesita
// una lista de orígenes (Mux, Supabase, fuentes) que se prueba en el navegador antes de imponerla.
const securityHeaders = [
  // Solo HTTPS durante 2 años; el navegador la ignora en http://localhost.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nadie incrusta la app en un iframe (evita el clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  /* config options here */
  // Permite abrir el servidor de desarrollo con 127.0.0.1 (otro jar de cookies que localhost).
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
