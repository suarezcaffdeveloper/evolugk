import type { NextConfig } from "next";

// Cabeceras de seguridad para todas las rutas (la política de contenido va más abajo).
const securityHeaders = [
  // Solo HTTPS durante 2 años; el navegador la ignora en http://localhost.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Nadie incrusta la app en un iframe (evita el clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), payment=(), usb=()" },
];

// Política de contenido (CSP). Decisión del hito 7 (docs/15-seguridad.md): SIN nonces, porque con la
// caché de componentes (prerenderizado parcial) Next no puede ponerles nonce a los scripts del shell
// estático. Se acepta `'unsafe-inline'` en scripts (los de arranque de Next) y se compensa cerrando
// todo lo demás: orígenes, formularios, base, objetos y quién puede incrustar la app.
const isDev = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next en desarrollo necesita eval para el recarga en caliente.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Estilos en línea permitidos: los atributos style="..." de React (colores de la escuela,
  // animaciones, anchos de barras) y las etiquetas <style> que inyecta el reproductor de Mux no se
  // pueden cubrir con nonces. Como los scripts en línea ya están permitidos, endurecer esto
  // aportaba muy poco.
  "style-src 'self' 'unsafe-inline'",
  // image.mux.com: miniaturas del reproductor.
  "img-src 'self' data: blob: https://image.mux.com",
  "font-src 'self'",
  // *.mux.com: reproducción (stream.mux.com) y subida directa (direct-uploads-*.mux.com).
  `connect-src 'self' https://*.mux.com${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  // image.mux.com también sirve el guion gráfico (storyboard.vtt) de las vistas previas del reproductor.
  "media-src 'self' blob: https://stream.mux.com https://image.mux.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  // Permite abrir el servidor de desarrollo con 127.0.0.1 (otro jar de cookies que localhost).
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
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
