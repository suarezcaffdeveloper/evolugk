import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { EvolutionRadar } from "@/components/evolution-radar";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Notice } from "@/components/ui/notice";
import { argentinaDate, formatCalendarDate } from "@/lib/dates";
import {
  ageOn,
  FOOT_LABELS,
  LEVEL_LABELS,
  STATUS_LABELS,
  type GoalkeeperStatus,
} from "@/lib/goalkeeper-schemas";
import { currentEvaluation, radarValues } from "@/lib/evolution";
import { getFamilyEvolution, toEvolutionSeries } from "@/server/guardian/evaluations";
import { listFamilyVideos } from "@/server/guardian/videos";
import { VIDEO_TOPIC_LABELS } from "@/lib/video-schemas";
import {
  getFamilyGoalkeeperProfile,
  listFamilyGoalkeepers,
  type FamilyGoalkeeperProfile,
} from "@/server/guardian/portal";
import { requireFamily } from "@/server/guardian/session";
import { createServiceClient } from "@/server/supabase";
import { PortalFrame } from "../portal-frame";

export const metadata: Metadata = {
  title: "Inicio · EvoluGK",
  robots: { index: false },
};

const STATUS_TONE: Record<GoalkeeperStatus, "success" | "neutral"> = {
  active: "success",
  inactive: "neutral",
  graduated: "neutral",
};

export default function GoalkeeperHomePage({ params }: PageProps<"/[slug]/familia/[arquero]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-64 w-full max-w-2xl animate-pulse rounded-card bg-line" />
      }
    >
      <GoalkeeperHome params={params} />
    </Suspense>
  );
}

async function GoalkeeperHome({ params }: Pick<PageProps<"/[slug]/familia/[arquero]">, "params">) {
  const { slug, arquero } = await params;
  const session = await requireFamily(slug);
  const db = createServiceClient();

  const goalkeepers = await listFamilyGoalkeepers(db, session);
  // Un arquero ajeno o inexistente es indistinguible de uno que no existe (CA-12).
  const goalkeeper = goalkeepers.find((g) => g.id === arquero);
  if (!goalkeeper) notFound();
  const [profile, evolution, videos] = await Promise.all([
    getFamilyGoalkeeperProfile(db, session, goalkeeper.id),
    getFamilyEvolution(db, session, goalkeeper.id),
    listFamilyVideos(db, session, goalkeeper.id),
  ]);
  const newCount = evolution.newCount + videos.newCount;
  const latestVideo = videos.videos[0];
  if (!profile) notFound();
  const current = currentEvaluation(toEvolutionSeries(evolution.evaluations));

  const today = argentinaDate(new Date());
  const privacyHref = `/${session.schoolSlug}/familia/${goalkeeper.id}/privacidad`;
  const evolutionHref = `/${session.schoolSlug}/familia/${goalkeeper.id}/evolucion`;
  const videosHref = `/${session.schoolSlug}/familia/${goalkeeper.id}/videos`;

  return (
    <PortalFrame slug={session.schoolSlug} goalkeepers={goalkeepers} currentId={goalkeeper.id}>
      <div className="rise-in space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={STATUS_TONE[goalkeeper.status]}>{STATUS_LABELS[goalkeeper.status]}</Chip>
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight">
          {goalkeeper.firstName} {goalkeeper.lastName}
        </h1>
        <p className="text-ink-muted">{ageOn(profile.birthDate, today)} años</p>
      </div>

      {goalkeeper.consent !== "valid" && (
        <Notice tone="warning">
          <p>
            {goalkeeper.consent === "revoked"
              ? "Retiraste el consentimiento de imagen y video: no se muestran videos ni fotos de este arquero."
              : "Todavía no aceptaste el consentimiento de imagen y video: no se muestran videos ni fotos de este arquero."}{" "}
            <Link href={privacyHref} className="font-bold underline underline-offset-4">
              Ir a Privacidad
            </Link>
          </p>
        </Notice>
      )}

      {newCount > 0 && (
        <Notice tone="success">
          <p>
            {newCount === 1 ? "Hay 1 novedad para ver." : `Hay ${newCount} novedades para ver.`}{" "}
            <Link href={`${evolutionHref}`} className="font-bold underline underline-offset-4">
              Ir a Evolución
            </Link>
          </p>
        </Notice>
      )}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Cómo viene</h2>
          {current && (
            <Link
              href={evolutionHref}
              className="text-sm font-semibold underline underline-offset-4"
            >
              Ver evolución
            </Link>
          )}
        </div>
        {current ? (
          <EvolutionRadar
            labels={evolution.categories.map((c) => c.name)}
            current={radarValues(
              current,
              evolution.categories.map((c) => c.key),
            )}
            currentLabel={`Última evaluación · ${formatCalendarDate(current.date)}`}
          />
        ) : (
          <p className="text-ink-muted">
            Todavía no hay evaluaciones publicadas. Cuando los profesores publiquen la primera, la
            vas a ver acá.
          </p>
        )}
      </Card>

      <Card className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Último video</h2>
          {latestVideo && (
            <Link href={videosHref} className="text-sm font-semibold underline underline-offset-4">
              Ver todos
            </Link>
          )}
        </div>
        {latestVideo ? (
          <Link
            href={`${videosHref}/${latestVideo.id}`}
            className="block space-y-0.5 hover:text-accent"
          >
            <span className="block font-semibold">{latestVideo.title}</span>
            <span className="block text-sm text-ink-muted">
              {VIDEO_TOPIC_LABELS[latestVideo.topic]}
              {latestVideo.isNew ? " · Nuevo" : ""}
            </span>
          </Link>
        ) : (
          <p className="text-ink-muted">
            {videos.consent === "valid"
              ? "Todavía no hay videos publicados."
              : "Los videos se muestran cuando está vigente el consentimiento de imagen y video."}
          </p>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-display text-lg font-bold">Ficha</h2>
        <Details profile={profile} />
      </Card>

      <Card className="space-y-3">
        <h2 className="font-display text-lg font-bold">Altura y peso</h2>
        <Measurements profile={profile} />
      </Card>
    </PortalFrame>
  );
}

function Details({ profile }: { profile: FamilyGoalkeeperProfile }) {
  const rows: [string, ReactNode][] = [
    ["Nivel", profile.level ? LEVEL_LABELS[profile.level] : null],
    ["Categoría", profile.category],
    ["Pie hábil", profile.preferredFoot ? FOOT_LABELS[profile.preferredFoot] : null],
    ["Club actual", profile.currentClub],
    ["Grupos", profile.groups.length > 0 ? profile.groups.join(", ") : null],
    ["Se sumó a la escuela", formatCalendarDate(profile.joinedOn)],
    ["Objetivo", profile.goal],
  ];
  return (
    <dl className="space-y-3">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
          <dt className="text-sm font-semibold text-ink-muted">{label}</dt>
          <dd>{value || <span className="text-ink-muted">Sin cargar</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function Measurements({ profile }: { profile: FamilyGoalkeeperProfile }) {
  if (profile.measurements.length === 0) {
    return <p className="text-ink-muted">Todavía no hay medidas cargadas.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-72 text-left">
        <thead>
          <tr className="text-sm text-ink-muted">
            <th scope="col" className="py-1.5 pr-3 font-semibold">
              Fecha
            </th>
            <th scope="col" className="py-1.5 pr-3 font-semibold">
              Altura
            </th>
            <th scope="col" className="py-1.5 font-semibold">
              Peso
            </th>
          </tr>
        </thead>
        <tbody>
          {profile.measurements.map((m) => (
            <tr key={m.id} className="border-t border-line">
              <td className="py-2 pr-3">{formatCalendarDate(m.date)}</td>
              <td className="py-2 pr-3">{m.heightCm === null ? "—" : `${m.heightCm} cm`}</td>
              <td className="py-2">{m.weightKg === null ? "—" : `${m.weightKg} kg`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
