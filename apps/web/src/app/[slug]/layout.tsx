import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { LegalLinks } from "@/components/legal-document";
import { SchoolLogo } from "@/components/school-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { isHex, resolveAccent } from "@/lib/color";
import { getSchoolBranding } from "@/server/tenant";

/** Color del producto, para escuelas que todavía no eligieron el suyo. */
const DEFAULT_ACCENT = "#C2410C";

/**
 * App instalable de la escuela (spec 04, RF-40): enlaza su manifest y el ícono de iOS, y le da a
 * la app el nombre de la escuela. Una escuela que no existe no aporta nada: la pantalla neutra la
 * resuelve el layout.
 */
export async function generateMetadata({ params }: LayoutProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const school = await getSchoolBranding(slug);
  if (!school) return {};
  const base = `/${slug.toLowerCase()}`;
  return {
    manifest: `${base}/manifest.webmanifest`,
    applicationName: school.name,
    icons: { apple: `${base}/icono/180.png` },
    appleWebApp: { capable: true, title: school.name, statusBarStyle: "default" },
  };
}

/**
 * Marco de cada escuela bajo /{slug}: resuelve el slug, aplica su marca (logo y color, con
 * contraste garantizado en modo claro y oscuro) y muestra la pantalla neutra si no existe
 * o está suspendida (spec 00, RF-01 a RF-04).
 */
export default function TenantLayout({ children, params }: LayoutProps<"/[slug]">) {
  return (
    <Suspense fallback={<TenantSkeleton />}>
      <TenantShell params={params}>{children}</TenantShell>
    </Suspense>
  );
}

async function TenantShell({
  params,
  children,
}: {
  params: LayoutProps<"/[slug]">["params"];
  children: ReactNode;
}) {
  const { slug } = await params;
  const school = await getSchoolBranding(slug);
  if (!school) notFound();

  const color =
    school.primaryColor && isHex(school.primaryColor) ? school.primaryColor : DEFAULT_ACCENT;
  const accent = resolveAccent(color);
  const brandStyle = {
    "--school-accent-light": accent.light.accent,
    "--school-on-accent-light": accent.light.onAccent,
    "--school-accent-dark": accent.dark.accent,
    "--school-on-accent-dark": accent.dark.onAccent,
  } as CSSProperties;

  return (
    <div className="school-brand flex min-h-screen flex-col" style={brandStyle}>
      {/* Color de la barra del navegador y del sistema. No puede ir en generateViewport: con la
          caché de componentes esa función no admite datos de la escuela. React lo sube al <head>. */}
      <meta name="theme-color" content={accent.light.accent} />
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <SchoolLogo name={school.name} logoUrl={school.logoUrl} />
          <p className="truncate font-display text-lg font-bold">{school.name}</p>
        </div>
        <ThemeToggle />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="px-4 py-6 text-center text-xs text-ink-muted">
        <p>Con tecnología de EvoluGK</p>
        <p className="mt-1">
          <LegalLinks />
        </p>
      </footer>
    </div>
  );
}

function TenantSkeleton() {
  return (
    <div className="flex min-h-screen flex-col" aria-busy="true" aria-label="Cargando">
      <div className="flex items-center gap-3 px-4 py-4 sm:px-8">
        <div className="h-11 w-11 animate-pulse rounded-control bg-line" />
        <div className="h-5 w-40 animate-pulse rounded bg-line" />
      </div>
    </div>
  );
}
