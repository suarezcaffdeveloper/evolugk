import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { requireSchoolAdmin } from "@/server/auth/guards";
import { getGoalkeeperDetail } from "@/server/goalkeepers";
import { createServiceClient } from "@/server/supabase";
import { EditForm } from "./edit-form";

export const metadata: Metadata = { title: "Editar arquero · EvoluGK", robots: { index: false } };

export default function EditGoalkeeperPage({
  params,
}: PageProps<"/[slug]/panel/arqueros/[id]/editar">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <EditContent params={params} />
      </Suspense>
    </main>
  );
}

async function EditContent({
  params,
}: Pick<PageProps<"/[slug]/panel/arqueros/[id]/editar">, "params">) {
  const { slug, id } = await params;
  // Solo la administración edita la ficha; el profesor no entra (spec 01, RF-08 y CA-08).
  const session = await requireSchoolAdmin(slug);
  const detail = await getGoalkeeperDetail(createServiceClient(), session.school.id, id);
  if (!detail) notFound();

  const values: Record<string, string> = {
    firstName: detail.firstName,
    lastName: detail.lastName,
    birthDate: detail.birthDate,
    joinedOn: detail.joinedOn,
    preferredFoot: detail.preferredFoot ?? "",
    level: detail.level ?? "",
    currentClub: detail.currentClub ?? "",
    category: detail.category ?? "",
    goal: detail.goal ?? "",
    emergencyName: detail.emergency.name ?? "",
    emergencyPhone: detail.emergency.phone ?? "",
    emergencyRelationship: detail.emergency.relationship ?? "",
  };

  return (
    <>
      <Link
        href={`/${session.school.slug}/panel/arqueros/${id}`}
        className="text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Volver a la ficha
      </Link>
      <h1 className="rise-in font-display text-3xl font-bold leading-tight">
        Editar a {detail.firstName}
      </h1>
      <Card className="rise-in">
        <EditForm slug={session.school.slug} goalkeeperId={id} initial={values} />
      </Card>
    </>
  );
}
