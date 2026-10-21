import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireStaff } from "@/server/auth/guards";
import { logoutAction } from "../login/actions";

export const metadata: Metadata = {
  title: "Panel · EvoluGK",
  robots: { index: false },
};

const ROLE_LABEL = { school_admin: "Administración", coach: "Profesor" } as const;

export default function PanelPage({ params }: PageProps<"/[slug]/panel">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-4">
      <Suspense
        fallback={<div className="h-40 animate-pulse rounded-card bg-line" aria-busy="true" />}
      >
        <PanelContent params={params} />
      </Suspense>
    </main>
  );
}

async function PanelContent({ params }: Pick<PageProps<"/[slug]/panel">, "params">) {
  const { slug } = await params;
  const session = await requireStaff(slug);

  return (
    <>
      <div className="rise-in space-y-1">
        <p className="text-sm font-semibold text-ink-muted">{ROLE_LABEL[session.role]}</p>
        <h1 className="font-display text-3xl font-bold leading-tight">Hola, {session.firstName}</h1>
      </div>

      <Link
        href={`/${session.school.slug}/panel/arqueros`}
        className="rise-in block rounded-card focus-visible:outline-offset-4"
        style={{ "--i": 1 } as CSSProperties}
      >
        <Card interactive className="space-y-1">
          <h2 className="font-display text-lg font-bold">Arqueros</h2>
          <p className="text-ink-muted">
            {session.role === "school_admin"
              ? "Altas, fichas, tutores y accesos de las familias."
              : "Mirá las fichas y registrá altura y peso."}
          </p>
        </Card>
      </Link>

      {session.role === "school_admin" && (
        <Link
          href={`/${session.school.slug}/panel/grupos`}
          className="rise-in block rounded-card focus-visible:outline-offset-4"
          style={{ "--i": 2 } as CSSProperties}
        >
          <Card interactive className="space-y-1">
            <h2 className="font-display text-lg font-bold">Grupos</h2>
            <p className="text-ink-muted">Organizá a los arqueros por edad, nivel u horario.</p>
          </Card>
        </Link>
      )}

      {session.role === "school_admin" && (
        <Link
          href={`/${session.school.slug}/panel/equipo`}
          className="rise-in block rounded-card focus-visible:outline-offset-4"
          style={{ "--i": 3 } as CSSProperties}
        >
          <Card interactive className="space-y-1">
            <h2 className="font-display text-lg font-bold">Equipo</h2>
            <p className="text-ink-muted">
              Invitá profesores y administradores, y gestioná quién tiene acceso.
            </p>
          </Card>
        </Link>
      )}

      <form
        action={logoutAction.bind(null, session.school.slug)}
        className="rise-in"
        style={{ "--i": 4 } as CSSProperties}
      >
        <SubmitButton variant="secondary" pendingText="Saliendo…">
          Cerrar sesión
        </SubmitButton>
      </form>
    </>
  );
}
