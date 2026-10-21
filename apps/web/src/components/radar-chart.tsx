"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tween, usePrefersReducedMotion } from "@/lib/motion";

const WIDTH = 500;
const HEIGHT = 340;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const RADIUS = 116;
const LABEL_OFFSET = 18;
const MAX = 10;
const RINGS = [0.25, 0.5, 0.75, 1];

export type RadarMode = "current" | "compare";

type Props = {
  /** Una etiqueta por eje (8 categorías de la rúbrica). */
  labels: string[];
  /** Puntajes actuales de 0 a 10; `null` = "sin evaluar". */
  current: Array<number | null>;
  /** Puntajes de la evaluación de ingreso; se muestran en modo "compare". */
  entry?: Array<number | null>;
  mode?: RadarMode;
};

function angle(i: number, total: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / total;
}

function point(i: number, total: number, value: number) {
  const a = angle(i, total);
  const r = (value / MAX) * RADIUS;
  return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r };
}

function toPoints(values: number[]): string {
  return values
    .map((v, i) => {
      const p = point(i, values.length, v);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(" ");
}

/** Parte una etiqueta larga en dos líneas, por el espacio más cercano al centro. */
function splitLabel(label: string): string[] {
  if (label.length <= 10 || !label.includes(" ")) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i += 1) {
    if (label[i] === " " && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return [label.slice(0, best), label.slice(best + 1)];
}

const clean = (values: Array<number | null>) => values.map((v) => v ?? 0);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Radar de evolución. El polígono se dibuja desde el centro al abrirse y, al pasar a
 * "ingreso vs. hoy", el polígono del ingreso se despliega superpuesto (interacción clave del brief).
 * El movimiento se hace sobre el DOM con refs para no re-renderizar en cada cuadro.
 */
export function RadarChart({ labels, current, entry, mode = "current" }: Props) {
  const reduced = usePrefersReducedMotion();
  const total = labels.length;

  const currentRef = useRef<SVGPolygonElement>(null);
  const entryRef = useRef<SVGPolygonElement>(null);
  const dotRefs = useRef<Array<SVGCircleElement | null>>([]);

  const shownCurrent = useRef<number[]>(clean(current));
  const entryProgress = useRef(mode === "compare" ? 1 : 0);
  const entryValues = entry ? clean(entry) : null;

  // Valores iniciales estables: después de montar, solo la animación modifica el DOM,
  // para que React no pise el movimiento al cambiar las props.
  const [initial] = useState(() => ({
    currentPoints: toPoints(clean(current)),
    entryPoints: entry ? toPoints(clean(entry).map((v) => v * (mode === "compare" ? 1 : 0))) : "",
    entryOpacity: mode === "compare" ? 1 : 0,
    dots: clean(current).map((v, i) => point(i, labels.length, v)),
  }));

  function paint() {
    const cur = shownCurrent.current;
    currentRef.current?.setAttribute("points", toPoints(cur));
    cur.forEach((v, i) => {
      const p = point(i, total, v);
      dotRefs.current[i]?.setAttribute("cx", p.x.toFixed(2));
      dotRefs.current[i]?.setAttribute("cy", p.y.toFixed(2));
    });
    if (entryRef.current && entryValues) {
      const scaled = entryValues.map((v) => v * entryProgress.current);
      entryRef.current.setAttribute("points", toPoints(scaled));
      entryRef.current.style.opacity = String(entryProgress.current);
    }
  }

  // Al abrirse: parte del centro (antes del primer pintado) para dibujarse hacia afuera.
  useLayoutEffect(() => {
    if (reduced) return;
    shownCurrent.current = shownCurrent.current.map(() => 0);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cuando cambian los puntajes (por ejemplo otro arquero), el polígono se transforma.
  useEffect(() => {
    const target = clean(current);
    if (reduced) {
      shownCurrent.current = target;
      paint();
      return;
    }
    const from = [...shownCurrent.current];
    return tween(900, (t) => {
      shownCurrent.current = target.map((v, i) => lerp(from[i] ?? 0, v, t));
      paint();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, reduced]);

  // Al cambiar de modo, el polígono del ingreso se despliega o se recoge.
  useEffect(() => {
    const target = mode === "compare" ? 1 : 0;
    if (reduced) {
      entryProgress.current = target;
      paint();
      return;
    }
    const from = entryProgress.current;
    return tween(700, (t) => {
      entryProgress.current = lerp(from, target, t);
      paint();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reduced, entry]);

  const summary = labels
    .map((label, i) => `${label}: ${current[i] === null ? "sin evaluar" : current[i]}`)
    .join(", ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Gráfico radar de ${total} categorías. ${summary}.`}
      className="mx-auto block h-auto w-full max-w-[500px]"
    >
      {/* Anillos */}
      {RINGS.map((ring) => (
        <polygon
          key={ring}
          points={toPoints(labels.map(() => ring * MAX))}
          fill="none"
          stroke="var(--line)"
          strokeWidth={ring === 1 ? 1.5 : 1}
        />
      ))}

      {/* Ejes */}
      {labels.map((_, i) => {
        const end = point(i, total, MAX);
        return (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={end.x}
            y2={end.y}
            stroke="var(--line)"
            strokeWidth={1}
          />
        );
      })}

      {/* Ingreso (se despliega en modo "compare") */}
      {entryValues && (
        <polygon
          ref={entryRef}
          points={initial.entryPoints}
          fill="color-mix(in oklab, var(--compare) 14%, transparent)"
          stroke="var(--compare)"
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeLinejoin="round"
          style={{ opacity: initial.entryOpacity }}
        />
      )}

      {/* Hoy */}
      <polygon
        ref={currentRef}
        points={initial.currentPoints}
        fill="color-mix(in oklab, var(--accent) 20%, transparent)"
        stroke="var(--accent)"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {initial.dots.map((p, i) => {
        return (
          <circle
            key={i}
            ref={(el) => {
              dotRefs.current[i] = el;
            }}
            cx={p.x}
            cy={p.y}
            r={4}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
            // Una categoría sin evaluar no lleva punto: no se inventa un valor (spec 02, CA-03).
            style={{ opacity: current[i] === null ? 0 : 1 }}
          />
        );
      })}

      {/* Etiquetas */}
      {labels.map((label, i) => {
        const a = angle(i, total);
        const x = CX + Math.cos(a) * (RADIUS + LABEL_OFFSET);
        const y = CY + Math.sin(a) * (RADIUS + LABEL_OFFSET);
        const lines = splitLabel(label);
        const cos = Math.cos(a);
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        const unrated = current[i] === null;
        // "Sin evaluar" va como una línea más, más chica, debajo del nombre del eje.
        const rows = unrated ? [...lines, "sin evaluar"] : lines;
        const firstDy = rows.length === 1 ? 0 : `${-0.55 * (rows.length - 1)}em`;
        return (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize={15}
            fontWeight={600}
            fill="var(--ink-muted)"
          >
            {rows.map((line, n) => (
              <tspan
                key={line}
                x={x}
                dy={n === 0 ? firstDy : "1.15em"}
                fontSize={unrated && n === rows.length - 1 ? 12 : undefined}
                fontWeight={unrated && n === rows.length - 1 ? 500 : undefined}
                fontStyle={unrated && n === rows.length - 1 ? "italic" : undefined}
              >
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}
