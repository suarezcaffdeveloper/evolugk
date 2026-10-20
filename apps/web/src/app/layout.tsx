import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fuentes alojadas en el repo (SIL OFL 1.1): el build no depende de Google Fonts
// ni del reemplazo interno de next/font/google, que falla con el build de Vercel.
const figtree = localFont({
  src: "./fonts/figtree-latin-wght-normal.woff2",
  weight: "300 900",
  variable: "--font-figtree",
  display: "swap",
});

const bricolage = localFont({
  src: "./fonts/bricolage-grotesque-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EvoluGK",
  description: "El seguimiento de cada arquero, en un solo lugar.",
};

/**
 * Aplica el tema guardado antes del primer pintado para evitar el parpadeo
 * (ver docs de Next.js: "Preventing Flash Before Hydration").
 * El modo claro es el predeterminado.
 */
const themeScript = `(function(){try{var t=localStorage.getItem("evolugk-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-AR"
      data-theme="light"
      suppressHydrationWarning
      className={`${figtree.variable} ${bricolage.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
