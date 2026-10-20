import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./cine.css";
import "./cine2.css";
import { Observer } from "@/components/Observer";
import { Chrome } from "@/components/Chrome";

// Jost (SIL OFL 1.1) alojada en el repo: el build no depende de Google Fonts
// ni del reemplazo interno de next/font/google, que falla con el build de Vercel.
const jost = localFont({
  src: "./fonts/jost-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-jost",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EvoluGK — Sistema para escuelas de arqueros",
  description:
    "Evaluaciones en un minuto, videos con comentarios, asistencia, cuotas y un portal para las familias con la marca de tu escuela.",
  openGraph: {
    title: "EvoluGK — Mostrale a cada familia cómo evoluciona su arquero",
    description:
      "El sistema para escuelas de arqueros: radar de evolución, videos, asistencia y cuotas.",
    locale: "es_AR",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#06110b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={jost.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        {children}
        <Observer />
        <Chrome />
      </body>
    </html>
  );
}
