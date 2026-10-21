"use client";

import { useState } from "react";
import { RadarChart } from "./radar-chart";
import { Segmented } from "./ui/segmented";

type Props = {
  labels: string[];
  /** Puntajes del estado actual; `null` = sin evaluar. */
  current: Array<number | null>;
  /** Puntajes de la evaluación de ingreso. Solo si hay comparativo (spec 02, RF-22). */
  entry?: Array<number | null> | null;
  /** Fechas ya formateadas para la leyenda. */
  currentLabel: string;
  entryLabel?: string;
};

/** Radar con el estado actual y, cuando existe, el comparativo ingreso vs. hoy. */
export function EvolutionRadar({ labels, current, entry, currentLabel, entryLabel }: Props) {
  const [mode, setMode] = useState<"current" | "compare">("current");

  return (
    <div className="space-y-3">
      {entry && (
        <Segmented
          label="Qué mostrar en el gráfico"
          value={mode}
          onChange={setMode}
          options={[
            { value: "current", label: "Hoy" },
            { value: "compare", label: "Ingreso vs. hoy" },
          ]}
        />
      )}
      <RadarChart labels={labels} current={current} entry={entry ?? undefined} mode={mode} />
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-ink-muted">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-5 rounded bg-accent" />
          {currentLabel}
        </li>
        {entry && mode === "compare" && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-0 w-5 border-t-2 border-dashed border-compare" />
            {entryLabel}
          </li>
        )}
      </ul>
    </div>
  );
}
