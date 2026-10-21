import { formatCalendarDate } from "@/lib/dates";
import { MAX_SCORE, MIN_SCORE } from "@/lib/evaluation-schemas";
import type { TimelinePoint } from "@/lib/evolution";

const WIDTH = 320;
const HEIGHT = 96;
const PAD_X = 14;
const PAD_Y = 12;

const dayNumber = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/**
 * Línea de tiempo de una categoría: un punto por evaluación publicada, ubicado según su fecha.
 * Con un solo punto no hay línea que mostrar. Es decorativo para quien usa lector de pantalla,
 * que recibe los mismos datos escritos.
 */
export function CategoryTimeline({ name, points }: { name: string; points: TimelinePoint[] }) {
  const first = points[0];
  const last = points[points.length - 1];
  const span = first && last ? dayNumber(last.date) - dayNumber(first.date) : 0;

  const x = (date: string) =>
    span === 0
      ? WIDTH / 2
      : PAD_X + ((dayNumber(date) - dayNumber(first.date)) / span) * (WIDTH - PAD_X * 2);
  const y = (score: number) =>
    PAD_Y + ((MAX_SCORE - score) / (MAX_SCORE - MIN_SCORE)) * (HEIGHT - PAD_Y * 2);

  const summary = points.map((p) => `${formatCalendarDate(p.date)}: ${p.score}`).join("; ");

  return (
    <figure className="space-y-1.5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{name}</span>
        {last ? (
          <span className="text-sm text-ink-muted">
            Última: <strong className="text-ink">{last.score}</strong>
          </span>
        ) : (
          <span className="text-sm text-ink-muted">Sin evaluar</span>
        )}
      </figcaption>

      {points.length === 0 ? (
        <p className="rounded-control bg-canvas px-3 py-4 text-center text-sm text-ink-muted">
          Todavía no se evaluó esta categoría.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`${name}. ${summary}.`}
          className="block h-auto w-full"
        >
          {[1, 5, 10].map((tick) => (
            <g key={tick}>
              <line
                x1={PAD_X}
                x2={WIDTH - PAD_X}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text x={0} y={y(tick)} dy="0.35em" fontSize={9} fill="var(--ink-muted)">
                {tick}
              </text>
            </g>
          ))}
          {points.length > 1 && (
            <polyline
              points={points
                .map((p) => `${x(p.date).toFixed(1)},${y(p.score).toFixed(1)}`)
                .join(" ")}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {points.map((p) => (
            <circle
              key={p.date + p.score}
              cx={x(p.date)}
              cy={y(p.score)}
              r={4.5}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          ))}
        </svg>
      )}

      {points.length > 1 && (
        <div className="flex justify-between text-xs text-ink-muted">
          <span>{formatCalendarDate(first.date)}</span>
          <span>{formatCalendarDate(last.date)}</span>
        </div>
      )}
    </figure>
  );
}
