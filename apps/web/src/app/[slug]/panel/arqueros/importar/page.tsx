import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS } from "@/lib/goalkeeper-import";
import { requireSchoolAdmin } from "@/server/auth/guards";
import { ImportForm } from "./import-form";

/** Importar 500 filas lleva varios minutos: la acción de esta pantalla puede tardar hasta 5. */
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "Importar arqueros · EvoluGK",
  robots: { index: false },
};

export default function ImportPage({ params }: PageProps<"/[slug]/panel/arqueros/importar">) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4"
    >
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <ImportContent params={params} />
      </Suspense>
    </main>
  );
}

async function ImportContent({
  params,
}: Pick<PageProps<"/[slug]/panel/arqueros/importar">, "params">) {
  const { slug } = await params;
  // Solo la administración importa (spec 01, sección 3).
  const session = await requireSchoolAdmin(slug);
  const base = `/${session.school.slug}/panel/arqueros`;

  return (
    <>
      <Link
        href={base}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Arqueros
      </Link>
      <h1 className="rise-in font-display text-3xl font-bold leading-tight">Importar arqueros</h1>

      <Card className="rise-in space-y-4">
        <h2 className="font-display text-lg font-bold">1. Descargá la plantilla</h2>
        <p className="text-ink-muted">
          Cada fila es un arquero con su tutor. Podés cargar hasta {MAX_IMPORT_ROWS} filas por
          archivo. Los hermanos con el mismo tutor llevan el mismo teléfono y quedan vinculados a un
          solo tutor.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`${base}/importar/plantilla?formato=xlsx`}
            className="inline-flex h-11 items-center rounded-control bg-accent px-4 font-semibold text-on-accent shadow-card hover:brightness-110"
          >
            Plantilla Excel (.xlsx)
          </a>
          <a
            href={`${base}/importar/plantilla?formato=csv`}
            className="inline-flex h-11 items-center rounded-control border border-line bg-surface px-4 font-semibold hover:bg-accent-soft"
          >
            Plantilla CSV
          </a>
        </div>
        <details className="rounded-control border border-line px-3 py-2">
          <summary className="cursor-pointer py-2 text-sm font-semibold">
            Qué lleva cada columna
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-ink-muted">
            {IMPORT_COLUMNS.map((c) => (
              <li key={c.key}>
                <span className="font-semibold text-ink">{c.header}</span>
                {c.required ? " (obligatoria)" : ""}
              </li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1 text-sm text-ink-muted">
            <li>Fechas como DD/MM/AAAA, por ejemplo 21/05/2012.</li>
            <li>Nivel: inicial, intermedio o avanzado. Pie hábil: derecho, izquierdo o ambos.</li>
            <li>
              Parentesco: madre, padre, tutor/a, abuelo/a, otro o el mismo (si no lo indicás, se usa
              tutor/a).
            </li>
            <li>Grupos: nombres de grupos que ya existan, separados por «|».</li>
          </ul>
        </details>
      </Card>

      <Card className="rise-in space-y-4">
        <h2 className="font-display text-lg font-bold">2. Subí el archivo completo</h2>
        <ImportForm slug={session.school.slug} />
      </Card>
    </>
  );
}
