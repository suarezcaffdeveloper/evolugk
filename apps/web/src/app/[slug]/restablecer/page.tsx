import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { normalizeSlug } from "@/lib/slug";
import { ResetForm } from "./form";

export const metadata: Metadata = {
  title: "Nueva contraseña · EvoluGK",
  robots: { index: false },
  // El link contiene un token: no se envía como referencia a otros sitios.
  referrer: "no-referrer",
};

export default function ResetPage({ params, searchParams }: PageProps<"/[slug]/restablecer">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-16">
      <Suspense
        fallback={<div className="h-72 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <ResetContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ResetContent({
  params,
  searchParams,
}: Pick<PageProps<"/[slug]/restablecer">, "params" | "searchParams">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const safeSlug = normalizeSlug(slug);
  const tokenHash = typeof query.token_hash === "string" ? query.token_hash : "";

  // Abrir esta página NO consume el link: el token se verifica recién al enviar el formulario.
  if (!tokenHash) {
    return (
      <Card className="rise-in space-y-3 p-6">
        <h1 className="font-display text-2xl font-bold">Link incompleto</h1>
        <p className="text-ink-muted">Pedí un link nuevo para elegir tu contraseña.</p>
        <Link
          href={`/${safeSlug}/recuperar`}
          className="inline-flex h-11 items-center justify-center rounded-control bg-accent px-4 font-semibold text-on-accent"
        >
          Pedir un link nuevo
        </Link>
      </Card>
    );
  }

  return (
    <Card className="rise-in space-y-5 p-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Elegí tu contraseña nueva</h1>
        <p className="text-sm text-ink-muted">Después vas a ingresar con ella.</p>
      </div>
      <ResetForm slug={safeSlug} tokenHash={tokenHash} />
    </Card>
  );
}
