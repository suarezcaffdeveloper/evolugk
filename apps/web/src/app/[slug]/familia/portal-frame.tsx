import type { ReactNode } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import type { FamilyGoalkeeper } from "@/server/guardian/portal";
import { logoutAction, selectGoalkeeperAction } from "./actions";
import { PortalNav } from "./portal-nav";

/**
 * Marco de las pantallas del portal: selector de arquero (solo si hay más de uno, RF-09 y RF-11),
 * navegación y cierre de sesión. Lo reciben las páginas que ya verificaron la sesión.
 */
export function PortalFrame({
  slug,
  goalkeepers,
  currentId,
  children,
}: {
  slug: string;
  goalkeepers: FamilyGoalkeeper[];
  /** El arquero abierto; en pantallas del tutor (Mis datos) es el último elegido. */
  currentId: string | null;
  children: ReactNode;
}) {
  const base = `/${slug}/familia`;
  const items = currentId
    ? [
        { href: `${base}/${currentId}`, label: "Inicio" },
        { href: `${base}/${currentId}/evolucion`, label: "Evolución" },
        { href: `${base}/${currentId}/videos`, label: "Videos" },
        { href: `${base}/${currentId}/asistencia`, label: "Asistencia" },
        { href: `${base}/${currentId}/privacidad`, label: "Privacidad" },
        { href: `${base}/mis-datos`, label: "Mis datos" },
      ]
    : [{ href: `${base}/mis-datos`, label: "Mis datos" }];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-2">
      {goalkeepers.length > 1 && (
        <form
          action={selectGoalkeeperAction.bind(null, slug)}
          aria-label="Elegir arquero"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {goalkeepers.map((g) => (
            <button
              key={g.id}
              type="submit"
              name="goalkeeperId"
              value={g.id}
              aria-pressed={g.id === currentId}
              className={cn(
                "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition-colors",
                g.id === currentId
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-surface hover:bg-accent-soft",
              )}
            >
              {g.firstName}
            </button>
          ))}
        </form>
      )}

      <PortalNav items={items} />

      {children}

      <div className="flex flex-wrap gap-2 pt-4">
        <form action={logoutAction.bind(null, slug, false)}>
          <SubmitButton variant="secondary" size="sm" pendingText="Saliendo…">
            Cerrar sesión
          </SubmitButton>
        </form>
        <form action={logoutAction.bind(null, slug, true)}>
          <SubmitButton variant="ghost" size="sm" pendingText="Saliendo…">
            Cerrar sesión en todos mis dispositivos
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
