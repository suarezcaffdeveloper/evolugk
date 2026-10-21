import { MAX_SCORE } from "@/lib/evaluation-schemas";

export type ScoreRow = {
  key: string;
  name: string;
  score: number | null;
  comment: string | null;
};

/**
 * Puntajes de una evaluación con una barra por categoría. Las categorías sin evaluar se muestran
 * como tales, sin inventar un valor (spec 02, RF-07; spec 04, RF-17). La barra es decorativa: el
 * puntaje siempre está escrito.
 */
export function ScoreList({ rows }: { rows: ScoreRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.key} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">{row.name}</span>
            {row.score === null ? (
              <span className="text-sm text-ink-muted">Sin evaluar</span>
            ) : (
              <span className="font-display text-lg font-bold tabular-nums">
                {row.score}
                <span className="text-sm font-medium text-ink-muted">/{MAX_SCORE}</span>
              </span>
            )}
          </div>
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-line">
            {row.score !== null && (
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(row.score / MAX_SCORE) * 100}%` }}
              />
            )}
          </div>
          {row.comment && <p className="text-sm text-ink-muted">{row.comment}</p>}
        </li>
      ))}
    </ul>
  );
}
