import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { normalizeSlug } from "@/lib/slug";
import { RecoverForm } from "./form";

export const metadata: Metadata = {
  title: "Recuperar contraseña · EvoluGK",
  robots: { index: false },
};

export default function RecoverPage({ params }: PageProps<"/[slug]/recuperar">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-16">
      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <RecoverContent params={params} />
      </Suspense>
    </main>
  );
}

async function RecoverContent({ params }: Pick<PageProps<"/[slug]/recuperar">, "params">) {
  const { slug } = await params;
  return (
    <Card className="rise-in space-y-5 p-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Recuperar tu contraseña</h1>
        <p className="text-sm text-ink-muted">
          Ingresá el mail de tu cuenta y te mandamos un link para elegir una nueva.
        </p>
      </div>
      <RecoverForm slug={normalizeSlug(slug)} />
    </Card>
  );
}
