import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/field";
import { argentinaDate } from "@/lib/dates";
import {
  ageOn,
  isLevel,
  isStatus,
  LEVEL_LABELS,
  LEVELS,
  STATUS_LABELS,
  STATUSES,
} from "@/lib/goalkeeper-schemas";
import { requireStaff } from "@/server/auth/guards";
import { listGoalkeepers, listGroups, type ConsentStatus } from "@/server/goalkeepers";
import { createServiceClient } from "@/server/supabase";
import { Select } from "./goalkeeper-fields";

export const metadata: Metadata = { title: "Arqueros · EvoluGK", robots: { index: false } };

const CONSENT: Record<ConsentStatus, { label: string; tone: "success" | "warning" | "danger" }> = {
  valid: { label: "Consentimiento vigente", tone: "success" },
  pending: { label: "Consentimiento pendiente", tone: "warning" },
  revoked: { label: "Consentimiento retirado", tone: "danger" },
};

export default function GoalkeepersPage({
  params,
  searchParams,
}: PageProps<"/[slug]/panel/arqueros">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <GoalkeepersContent params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

async function GoalkeepersContent({
  params,
  searchParams,
}: Pick<PageProps<"/[slug]/panel/arqueros">, "params" | "searchParams">) {
  const { slug } = await params;
  const session = await requireStaff(slug);
  const query = await searchParams;

  const q = first(query.q)?.trim() ?? "";
  const statusParam = first(query.estado);
  const status = statusParam === "all" || isStatus(statusParam) ? statusParam : "active";
  const levelParam = first(query.nivel);
  const level = isLevel(levelParam) ? levelParam : undefined;
  const groupId = first(query.grupo) || undefined;

  const db = createServiceClient();
  const [goalkeepers, groups] = await Promise.all([
    listGoalkeepers(db, session.school.id, { q, status, level, groupId }),
    listGroups(db, session.school.id),
  ]);
  const today = argentinaDate(new Date());
  const isAdmin = session.role === "school_admin";
  const filtered = Boolean(q || level || groupId || status !== "active");

  return (
    <>
      <Link
        href={`/${session.school.slug}/panel`}
        className="text-sm font-semibold text-ink-muted hover:text-ink"
      >
        ← Volver al panel
      </Link>
      <div className="rise-in flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold leading-tight">Arqueros</h1>
          <p className="text-ink-muted">
            {goalkeepers.length} {goalkeepers.length === 1 ? "arquero" : "arqueros"}
            {filtered ? " con estos filtros" : ""}
          </p>
        </div>
        {isAdmin && (
          <Link
            href={`/${session.school.slug}/panel/arqueros/nuevo`}
            className="inline-flex h-11 items-center rounded-control bg-accent px-4 font-semibold text-on-accent shadow-card hover:brightness-110"
          >
            Nuevo arquero
          </Link>
        )}
      </div>

      <Card className="rise-in" style={{ "--i": 1 } as CSSProperties}>
        <form method="get" className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="q" className="sr-only">
              Buscar por nombre
            </label>
            <Input
              id="q"
              name="q"
              type="search"
              placeholder="Buscar por nombre o apellido"
              defaultValue={q}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="estado" className="sr-only">
              Estado
            </label>
            <Select id="estado" name="estado" defaultValue={status}>
              <option value="active">Activos</option>
              {STATUSES.filter((s) => s !== "active").map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}s
                </option>
              ))}
              <option value="all">Todos los estados</option>
            </Select>
          </div>
          <div>
            <label htmlFor="nivel" className="sr-only">
              Nivel
            </label>
            <Select id="nivel" name="nivel" defaultValue={level ?? ""}>
              <option value="">Todos los niveles</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="grupo" className="sr-only">
              Grupo
            </label>
            <Select id="grupo" name="grupo" defaultValue={groupId ?? ""}>
              <option value="">Todos los grupos</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-control bg-accent px-4 font-semibold text-on-accent"
            >
              Filtrar
            </button>
            {filtered && (
              <Link
                href={`/${session.school.slug}/panel/arqueros`}
                className="inline-flex h-11 items-center rounded-control px-4 font-semibold text-ink-muted hover:text-ink"
              >
                Limpiar
              </Link>
            )}
          </div>
        </form>
      </Card>

      {goalkeepers.length === 0 ? (
        <Card className="rise-in space-y-1 text-center" style={{ "--i": 2 } as CSSProperties}>
          <p className="font-display text-lg font-bold">
            {filtered ? "No hay arqueros con esos filtros" : "Todavía no hay arqueros"}
          </p>
          <p className="text-ink-muted">
            {filtered
              ? "Probá con otra búsqueda o limpiá los filtros."
              : isAdmin
                ? "Dá de alta al primero para empezar."
                : "La administración todavía no cargó arqueros."}
          </p>
        </Card>
      ) : (
        <ul className="rise-in space-y-2" style={{ "--i": 2 } as CSSProperties}>
          {goalkeepers.map((g) => (
            <li key={g.id}>
              <Link
                href={`/${session.school.slug}/panel/arqueros/${g.id}`}
                className="block rounded-card focus-visible:outline-offset-4"
              >
                <Card interactive className="space-y-2 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-display text-lg font-bold">
                      {g.lastName}, {g.firstName}
                    </p>
                    <p className="text-sm text-ink-muted">{ageOn(g.birthDate, today)} años</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Chip tone={CONSENT[g.consent].tone}>{CONSENT[g.consent].label}</Chip>
                    {g.status !== "active" && <Chip>{STATUS_LABELS[g.status]}</Chip>}
                    {g.level && <Chip>{LEVEL_LABELS[g.level]}</Chip>}
                    {g.groups.map((group) => (
                      <Chip key={group.id}>{group.name}</Chip>
                    ))}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
