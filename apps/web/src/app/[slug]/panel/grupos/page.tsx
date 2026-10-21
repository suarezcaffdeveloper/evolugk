import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { requireSchoolAdmin } from "@/server/auth/guards";
import { listGroups } from "@/server/goalkeepers";
import { createServiceClient } from "@/server/supabase";
import { CreateGroupForm, GroupRow } from "./group-forms";

export const metadata: Metadata = { title: "Grupos · EvoluGK", robots: { index: false } };

export default function GroupsPage({ params }: PageProps<"/[slug]/panel/grupos">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <GroupsContent params={params} />
      </Suspense>
    </main>
  );
}

async function GroupsContent({ params }: Pick<PageProps<"/[slug]/panel/grupos">, "params">) {
  const { slug } = await params;
  // Solo la administración gestiona los grupos; un profesor vuelve al panel.
  const session = await requireSchoolAdmin(slug);
  const groups = await listGroups(createServiceClient(), session.school.id, {
    includeArchived: true,
  });
  const active = groups.filter((g) => !g.archived);
  const archived = groups.filter((g) => g.archived);

  return (
    <>
      <Link
        href={`/${session.school.slug}/panel`}
        className="text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Volver al panel
      </Link>
      <div className="rise-in space-y-1">
        <h1 className="font-display text-3xl font-bold leading-tight">Grupos</h1>
        <p className="text-ink-muted">
          Los grupos organizan a los arqueros (por edad, nivel u horario). No limitan qué ve cada
          profesor.
        </p>
      </div>

      <Card className="rise-in space-y-4" style={{ "--i": 1 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Grupos vigentes</h2>
        {active.length === 0 ? (
          <p className="text-ink-muted">Todavía no creaste grupos.</p>
        ) : (
          <ul className="divide-y divide-line">
            {active.map((group) => (
              <li key={group.id} className="space-y-1 py-3">
                <GroupRow slug={session.school.slug} group={group} />
                <Chip>
                  {group.memberCount} {group.memberCount === 1 ? "arquero" : "arqueros"}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="rise-in space-y-4" style={{ "--i": 2 } as CSSProperties}>
        <h2 className="font-display text-lg font-bold">Crear un grupo</h2>
        <CreateGroupForm slug={session.school.slug} />
      </Card>

      {archived.length > 0 && (
        <Card className="rise-in space-y-4" style={{ "--i": 3 } as CSSProperties}>
          <h2 className="font-display text-lg font-bold">Archivados</h2>
          <p className="text-sm text-ink-muted">
            No se ofrecen para nuevas asignaciones, pero conservan a sus integrantes y su historial.
          </p>
          <ul className="divide-y divide-line">
            {archived.map((group) => (
              <li key={group.id} className="space-y-1 py-3">
                <GroupRow slug={session.school.slug} group={group} />
                <Chip>
                  {group.memberCount} {group.memberCount === 1 ? "arquero" : "arqueros"}
                </Chip>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
