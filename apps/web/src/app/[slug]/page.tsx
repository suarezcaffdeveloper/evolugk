import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { normalizeSlug } from "@/lib/slug";
import { getSchoolBranding } from "@/server/tenant";

export default function SchoolHomePage({ params }: PageProps<"/[slug]">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-4 pb-16 text-center">
      <Suspense fallback={<div className="mx-auto h-10 w-64 animate-pulse rounded bg-line" />}>
        <SchoolWelcome params={params} />
      </Suspense>
    </main>
  );
}

async function SchoolWelcome({ params }: Pick<PageProps<"/[slug]">, "params">) {
  const { slug } = await params;
  const school = await getSchoolBranding(slug);

  return (
    <>
      <p className="rise-in text-sm font-semibold text-ink-muted">Bienvenido a</p>
      <h1
        className="rise-in font-display text-4xl font-bold leading-tight"
        style={{ "--i": 1 } as CSSProperties}
      >
        {school?.name}
      </h1>
      <div className="rise-in mt-4" style={{ "--i": 2 } as CSSProperties}>
        <Link
          href={`/${normalizeSlug(slug)}/login`}
          className="inline-flex h-12 items-center justify-center rounded-control bg-accent px-6 font-semibold text-on-accent shadow-card transition-[box-shadow,transform,filter] duration-150 hover:shadow-card-hover hover:brightness-110 active:scale-[0.97]"
        >
          Ingreso del equipo
        </Link>
      </div>
    </>
  );
}
