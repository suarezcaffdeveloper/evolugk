import Link from "next/link";
import { cn } from "@/lib/cn";
import { MONTH_NAMES, shiftMonth, type CalendarCell, type DayStatus } from "@/lib/attendance";

const STATUS: Record<DayStatus, { label: string; className: string }> = {
  present: { label: "Presente", className: "bg-success text-on-success" },
  absent: { label: "Ausente", className: "bg-danger text-on-danger" },
  excused: { label: "Justificada", className: "bg-warning text-on-warning" },
  suspended: { label: "Suspendida", className: "bg-line text-ink" },
  unmarked: {
    label: "Sin marcar",
    className: "border border-dashed border-ink-muted text-ink-muted",
  },
};

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Calendario mensual de asistencia (spec 05, RF-17 y RF-19). El color nunca es lo único que
 * informa: cada día con registro lleva su estado escrito para lectores de pantalla y hay una
 * leyenda visible. Nunca muestra el motivo de una justificación.
 */
export function AttendanceCalendar({
  year,
  month,
  weeks,
  hrefForMonth,
}: {
  year: number;
  month: number;
  weeks: CalendarCell[][];
  /** Arma el enlace para ir a otro mes ("AAAA-MM"). */
  hrefForMonth: (value: string) => string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={hrefForMonth(shiftMonth(year, month, -1))}
          aria-label="Mes anterior"
          className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-line bg-surface hover:bg-accent-soft"
        >
          ←
        </Link>
        <h3 className="font-display text-lg font-bold capitalize">
          {MONTH_NAMES[month - 1]} de {year}
        </h3>
        <Link
          href={hrefForMonth(shiftMonth(year, month, 1))}
          aria-label="Mes siguiente"
          className="inline-flex h-11 w-11 items-center justify-center rounded-control border border-line bg-surface hover:bg-accent-soft"
        >
          →
        </Link>
      </div>

      <table className="w-full table-fixed border-separate border-spacing-1 text-center">
        <caption className="sr-only">
          Asistencia de {MONTH_NAMES[month - 1]} de {year}
        </caption>
        <thead>
          <tr className="text-xs font-semibold text-ink-muted">
            {WEEKDAYS.map((day, i) => (
              <th key={i} scope="col" className="py-1">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, w) => (
            <tr key={w}>
              {week.map((cell, d) => (
                <td key={d} className="p-0">
                  {cell && (
                    <div
                      className={cn(
                        "flex aspect-square items-center justify-center rounded-control text-sm font-semibold",
                        cell.status ? STATUS[cell.status].className : "bg-canvas text-ink-muted",
                      )}
                    >
                      {cell.day}
                      {cell.status && (
                        <span className="sr-only">: {STATUS[cell.status].label}</span>
                      )}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted"
        aria-label="Referencias"
      >
        {(["present", "absent", "excused", "suspended"] as const).map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("inline-block h-3 w-3 rounded", STATUS[status].className)}
            />
            {STATUS[status].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
