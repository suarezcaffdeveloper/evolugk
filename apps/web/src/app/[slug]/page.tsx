import { Suspense, type CSSProperties } from "react";
import { getSchoolBranding } from "@/server/tenant";

export default function SchoolHomePage({ params }: PageProps<"/[slug]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-4 pb-16 text-center">
      <p className="rise-in text-sm font-semibold text-ink-muted">Portal de familias y equipo</p>
      <Suspense fallback={<div className="mx-auto h-10 w-64 animate-pulse rounded bg-line" />}>
        <SchoolName params={params} />
      </Suspense>
      <p className="rise-in text-ink-muted" style={{ "--i": 2 } as CSSProperties}>
        El ingreso estará disponible muy pronto.
      </p>
    </main>
  );
}

async function SchoolName({ params }: Pick<PageProps<"/[slug]">, "params">) {
  const { slug } = await params;
  const school = await getSchoolBranding(slug);
  return (
    <h1
      className="rise-in font-display text-4xl font-bold leading-tight"
      style={{ "--i": 1 } as CSSProperties}
    >
      {school?.name}
    </h1>
  );
}
