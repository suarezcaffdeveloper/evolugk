"use client";

/*
 * PROTOTIPO DE DISEÑO (hito 0) — se elimina cuando existan las pantallas reales.
 * Sirve para validar el brief: color, tipografía, componentes, animación y modo oscuro,
 * con el color de distintas escuelas y el ajuste automático de contraste.
 */

import { useMemo, useState, type CSSProperties } from "react";
import { CountUp } from "@/components/count-up";
import { RadarChart, type RadarMode } from "@/components/radar-chart";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { resolveAccent } from "@/lib/color";

const LABELS = [
  "Atajada",
  "Juego aéreo",
  "Juego con los pies",
  "Posicionamiento",
  "Reflejos",
  "Comunicación",
  "Físico",
  "Mentalidad",
];

const SCHOOLS = [
  { id: "sur", name: "Guantes del Sur", initials: "GS", color: "#C2410C" },
  { id: "nandu", name: "Academia Ñandú", initials: "AÑ", color: "#1D4ED8" },
  { id: "litoral", name: "Porteros del Litoral", initials: "PL", color: "#15803D" },
  { id: "rayo", name: "Escuela Rayo", initials: "ER", color: "#FACC15" },
];

const CHILDREN = [
  {
    id: "mateo",
    name: "Mateo",
    current: [8, 7, 6, 7, 8, 6, 7, 8],
    entry: [4, 3, 5, 4, 5, 3, 4, 5],
  },
  {
    id: "lucia",
    name: "Lucía",
    current: [7, 8, 7, 6, 7, 8, 6, 7],
    entry: [5, 4, 4, 5, 4, 5, 5, 4],
  },
];

const PLAYERS = ["Mateo R.", "Lucía P.", "Bruno S.", "Camila G.", "Thiago L.", "Valentina M."];

type Mark = "present" | "absent" | undefined;

const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      <span>{children}</span>
    </span>
  );
}

function Bar({ value }: { value: number }) {
  // Se anima con una transición CSS desde 0 hasta el valor.
  const [on, setOn] = useState(false);
  const ref = (el: HTMLDivElement | null) => {
    if (el && !on) requestAnimationFrame(() => setOn(true));
  };
  return (
    <div className="h-2 overflow-hidden rounded-full bg-accent-soft" ref={ref}>
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-out-soft"
        style={{ width: on ? `${value}%` : "0%" }}
      />
    </div>
  );
}

export default function ProtoPage() {
  const [schoolId, setSchoolId] = useState("sur");
  const [childId, setChildId] = useState("mateo");
  const [mode, setMode] = useState<RadarMode>("current");
  const [marks, setMarks] = useState<Mark[]>(PLAYERS.map(() => undefined));
  const [saved, setSaved] = useState(false);

  const school = SCHOOLS.find((s) => s.id === schoolId) ?? SCHOOLS[0];
  const child = CHILDREN.find((c) => c.id === childId) ?? CHILDREN[0];
  const accent = useMemo(() => resolveAccent(school.color), [school.color]);

  const brandStyle = {
    "--school-accent-light": accent.light.accent,
    "--school-on-accent-light": accent.light.onAccent,
    "--school-accent-dark": accent.dark.accent,
    "--school-on-accent-dark": accent.dark.onAccent,
  } as CSSProperties;

  const now = average(child.current);
  const delta = now - average(child.entry);
  const marked = marks.filter(Boolean).length;

  function mark(index: number, value: Mark) {
    setSaved(false);
    setMarks((prev) => prev.map((m, i) => (i === index ? value : m)));
  }

  return (
    <main id="contenido" className="school-brand min-h-screen px-4 py-8 sm:px-8" style={brandStyle}>
      <div className="mx-auto max-w-6xl">
        {/* Barra de control del prototipo */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink-muted">Prototipo de diseño · Hito 0</p>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">EvoluGK</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Escuela de ejemplo">
              {SCHOOLS.map((s) => {
                const selected = s.id === schoolId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSchoolId(s.id)}
                    className={cn(
                      "inline-flex h-11 items-center gap-2 rounded-control border px-3 text-sm font-semibold",
                      "transition-[background-color,border-color,transform] duration-150 active:scale-95",
                      selected
                        ? "border-accent bg-accent-soft"
                        : "border-line bg-surface hover:bg-accent-soft",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 rounded-full border border-line"
                      style={{ background: s.color }}
                    />
                    {s.name}
                  </button>
                );
              })}
            </div>
            <ThemeToggle />
          </div>
        </header>

        {/* Verificación del color de la escuela */}
        <Card className="mb-8 p-4 text-sm">
          <p className="font-semibold">
            Color de {school.name}: <span className="tabular">{school.color}</span>
          </p>
          <p className="mt-1 text-ink-muted">
            Modo claro →{" "}
            <span className="tabular">
              {accent.light.accent} · texto {accent.light.textContrast.toFixed(1)}:1 · fondo{" "}
              {accent.light.uiContrast.toFixed(1)}:1
            </span>
            {accent.light.adjusted ? " (ajustado)" : " (sin cambios)"}
            {" · "}Modo oscuro →{" "}
            <span className="tabular">
              {accent.dark.accent} · texto {accent.dark.textContrast.toFixed(1)}:1 · fondo{" "}
              {accent.dark.uiContrast.toFixed(1)}:1
            </span>
            {accent.dark.adjusted ? " (ajustado)" : " (sin cambios)"}
          </p>
        </Card>

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ───────── Portal de la familia (celular) ───────── */}
          <section aria-labelledby="portal-title">
            <h2
              id="portal-title"
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted"
            >
              Portal de la familia
            </h2>
            <div className="rounded-[28px] border border-line bg-canvas p-4 shadow-card-hover">
              <div
                className="rise-in mb-5 flex items-center gap-3"
                style={{ "--i": 0 } as CSSProperties}
              >
                <div
                  aria-hidden="true"
                  className="flex h-11 w-11 items-center justify-center rounded-control bg-accent font-display text-lg font-bold text-on-accent"
                >
                  {school.initials}
                </div>
                <div>
                  <p className="font-display text-lg font-bold leading-tight">{school.name}</p>
                  <p className="text-sm text-ink-muted">Portal de familias</p>
                </div>
              </div>

              <div
                className="rise-in mb-4 flex gap-2"
                role="radiogroup"
                aria-label="Arquero"
                style={{ "--i": 1 } as CSSProperties}
              >
                {CHILDREN.map((c) => {
                  const selected = c.id === childId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setChildId(c.id)}
                      className={cn(
                        "h-11 rounded-full px-5 text-sm font-semibold",
                        "transition-[background-color,color,transform] duration-200 active:scale-95",
                        selected
                          ? "bg-accent text-on-accent shadow-card"
                          : "border border-line bg-surface text-ink hover:bg-accent-soft",
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>

              <div className="rise-in mb-4" style={{ "--i": 2 } as CSSProperties}>
                <p className="text-sm text-ink-muted">Hola, familia de {child.name}</p>
                <h3 className="font-display text-3xl font-bold leading-tight">
                  Evolución de {child.name}
                </h3>
              </div>

              <Card className="rise-in mb-4" style={{ "--i": 3 } as CSSProperties}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-muted">Promedio actual</p>
                    <p className="font-display text-5xl font-bold leading-none">
                      <CountUp value={now} decimals={1} />
                      <span className="ml-1 text-xl font-semibold text-ink-muted">/ 10</span>
                    </p>
                  </div>
                  <Chip className="bg-success/15 text-success">
                    ▲ +<CountUp value={delta} decimals={1} /> desde el ingreso
                  </Chip>
                </div>

                <Segmented<RadarMode>
                  label="Vista del gráfico"
                  className="mt-4"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "current", label: "Hoy" },
                    { value: "compare", label: "Ingreso vs. hoy" },
                  ]}
                />

                <div className="mt-2">
                  <RadarChart
                    key={child.id}
                    labels={LABELS}
                    current={child.current}
                    entry={child.entry}
                    mode={mode}
                  />
                </div>

                <div className="mt-1 flex items-center justify-center gap-5 text-xs font-semibold text-ink-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-accent" /> Hoy
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 transition-opacity duration-300",
                      mode === "compare" ? "opacity-100" : "opacity-30",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="h-0 w-4 border-t-2 border-dashed border-compare"
                    />
                    Ingreso
                  </span>
                </div>
              </Card>

              <div className="mb-4 grid grid-cols-2 gap-3">
                <Card className="rise-in p-4" style={{ "--i": 4 } as CSSProperties}>
                  <p className="text-sm font-semibold text-ink-muted">Asistencia</p>
                  <p className="font-display text-3xl font-bold">
                    <CountUp value={86} suffix="%" />
                  </p>
                  <div className="mt-2">
                    <Bar value={86} />
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">Últimos 90 días</p>
                </Card>
                <Card className="rise-in p-4" style={{ "--i": 5 } as CSSProperties}>
                  <p className="text-sm font-semibold text-ink-muted">Cuota</p>
                  <p className="mt-1">
                    <Chip className="bg-success/15 text-success">● Al día</Chip>
                  </p>
                  <p className="mt-3 text-xs text-ink-muted">Próximo pago</p>
                  <p className="tabular text-sm font-semibold">12/05</p>
                </Card>
              </div>

              <Card
                interactive
                className="rise-in overflow-hidden p-0"
                style={{ "--i": 6 } as CSSProperties}
              >
                <div
                  className="relative flex h-36 items-center justify-center"
                  style={{
                    background:
                      "linear-gradient(135deg, color-mix(in oklab, var(--accent) 80%, black), var(--accent))",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-surface/95 shadow-card"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="24"
                      height="24"
                      fill="var(--ink)"
                      aria-hidden="true"
                    >
                      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                    </svg>
                  </span>
                  <Chip className="new-glint absolute left-3 top-3 bg-surface text-ink">Nuevo</Chip>
                  <span className="tabular absolute bottom-3 right-3 rounded-md bg-black/55 px-1.5 py-0.5 text-xs font-semibold text-white">
                    1:24
                  </span>
                </div>
                <div className="p-4">
                  <p className="font-display text-lg font-bold leading-tight">
                    Salida a pelota aérea
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    Prof. Gómez · hace 2 días · 3 comentarios
                  </p>
                </div>
              </Card>

              <p className="mt-5 text-center text-xs text-ink-muted">Con tecnología de EvoluGK</p>
            </div>
          </section>

          {/* ───────── App del profesor ───────── */}
          <section aria-labelledby="staff-title">
            <h2
              id="staff-title"
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted"
            >
              App del profesor
            </h2>
            <Card className="max-w-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl font-bold">Asistencia</h3>
                  <p className="text-sm text-ink-muted">Sub-12 · martes 18:00</p>
                </div>
                <Chip className="bg-accent-soft text-ink">
                  <span className="tabular">
                    {marked} de {PLAYERS.length}
                  </span>{" "}
                  marcados
                </Chip>
              </div>

              <ul className="mt-4 divide-y divide-line">
                {PLAYERS.map((name, i) => (
                  <li key={name} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="font-semibold">{name}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        aria-pressed={marks[i] === "present"}
                        onClick={() => mark(i, marks[i] === "present" ? undefined : "present")}
                        className={cn(
                          "h-11 min-w-[88px] rounded-control border px-3 text-sm font-semibold",
                          "transition-[background-color,color,border-color,transform] duration-150 active:scale-95",
                          marks[i] === "present"
                            ? "border-success bg-success text-canvas"
                            : "border-line bg-surface hover:bg-accent-soft",
                        )}
                      >
                        Presente
                      </button>
                      <button
                        type="button"
                        aria-pressed={marks[i] === "absent"}
                        onClick={() => mark(i, marks[i] === "absent" ? undefined : "absent")}
                        className={cn(
                          "h-11 min-w-[88px] rounded-control border px-3 text-sm font-semibold",
                          "transition-[background-color,color,border-color,transform] duration-150 active:scale-95",
                          marks[i] === "absent"
                            ? "border-danger bg-danger text-canvas"
                            : "border-line bg-surface hover:bg-accent-soft",
                        )}
                      >
                        Ausente
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="secondary"
                  className="sm:flex-1"
                  onClick={() => {
                    setSaved(false);
                    setMarks((prev) => prev.map((m) => m ?? "present"));
                  }}
                >
                  Todos presentes
                </Button>
                <Button size="lg" className="sm:flex-1" onClick={() => setSaved(true)}>
                  {saved ? "✓ Lista guardada" : "Guardar asistencia"}
                </Button>
              </div>
            </Card>

            <Card className="mt-6 max-w-xl">
              <h3 className="font-display text-xl font-bold">Botones y estados</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button>Primario</Button>
                <Button variant="secondary">Secundario</Button>
                <Button variant="ghost">Fantasma</Button>
                <Button disabled>Deshabilitado</Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Chip className="bg-success/15 text-success">● Al día</Chip>
                <Chip className="bg-warning/15 text-warning">● Por vencer</Chip>
                <Chip className="bg-danger/15 text-danger">● Vencida</Chip>
                <Chip className="bg-accent-soft text-ink">Nuevo</Chip>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
