import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { requireSchoolAdmin } from "@/server/auth/guards";
import { listGroups } from "@/server/goalkeepers";
import { createServiceClient } from "@/server/supabase";
import { NewGoalkeeperForm } from "./new-form";

export const metadata: Metadata = { title: "Nuevo arquero · EvoluGK", robots: { index: false } };

export default function NewGoalkeeperPage({
  params,
  searchParams,
}: PageProps<"/[slug]/panel/arqueros/nuevo">) {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4"
    >
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <NewGoalkeeperContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function NewGoalkeeperContent({
  params,
  searchParams,
}: Pick<PageProps<"/[slug]/panel/arqueros/nuevo">, "params" | "searchParams">) {
  const { slug } = await params;
  // Solo la administración da de alta (spec 01, RF-08).
  const session = await requireSchoolAdmin(slug);
  const { tutor } = await searchParams;
  const guardianId = Array.isArray(tutor) ? tutor[0] : tutor;

  const db = createServiceClient();
  const [groups, guardian] = await Promise.all([
    listGroups(db, session.school.id),
    guardianId
      ? db
          .from("guardian")
          .select("id, first_name, last_name, phone")
          .eq("id", guardianId)
          .eq("school_id", session.school.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <>
      <Link
        href={`/${session.school.slug}/panel/arqueros`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Arqueros
      </Link>
      <h1 className="rise-in font-display text-3xl font-bold leading-tight">Nuevo arquero</h1>
      <Card className="rise-in">
        <NewGoalkeeperForm
          slug={session.school.slug}
          schoolName={session.school.name}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          existingGuardian={
            guardian.data
              ? {
                  id: guardian.data.id,
                  name: `${guardian.data.first_name} ${guardian.data.last_name}`,
                  phone: guardian.data.phone,
                }
              : null
          }
        />
      </Card>
    </>
  );
}
