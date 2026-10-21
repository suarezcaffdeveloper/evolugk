import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireOperator } from "@/server/auth/guards";
import { NewSchoolForm } from "./new-school-form";

export const metadata: Metadata = { title: "Nueva escuela · EvoluGK", robots: { index: false } };

export default function NewSchoolPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Link href="/operator" className="text-sm font-semibold text-ink-muted hover:text-ink">
        ← Volver a las escuelas
      </Link>
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <NewSchoolContent />
      </Suspense>
    </main>
  );
}

async function NewSchoolContent() {
  await requireOperator("ready");
  return (
    <>
      <div className="rise-in space-y-1">
        <h1 className="font-display text-3xl font-bold leading-tight">Nueva escuela</h1>
        <p className="text-ink-muted">
          Se crea con su período de prueba y se le manda la invitación a su administrador.
        </p>
      </div>
      <NewSchoolForm />
    </>
  );
}
