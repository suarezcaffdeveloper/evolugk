import { CATEGORIES } from "@/lib/content";

const SHORT = ["Atajada", "Aéreo", "Pies", "Posición", "Reflejos", "Comunicación", "Físico", "Mentalidad"];
const R = 108; // radio al vértice; el octógono toca los bordes del viewBox
const angle = (k: number) => ((-67.5 + 45 * k) * Math.PI) / 180;
const pt = (k: number, v: number) => {
  const r = (v / 10) * R;
  return [Math.cos(angle(k)) * r, Math.sin(angle(k)) * r] as const;
};
const poly = (vals: number[]) => vals.map((v, k) => pt(k, v).map((n) => n.toFixed(2)).join(",")).join(" ");

type Props = {
  values: number[];
  /** valores de comparación dibujados detrás (p. ej. el ingreso) */
  ghost?: number[];
  ring?: [string, string];
  fill: string;
  ghostFill?: string;
  label?: string;
  labels?: boolean;
};

/** Radar de 8 categorías. Es el octógono que sostiene toda la página. */
export function Radar({ values, ghost, ring = ["rgba(0,0,0,.14)", "rgba(0,0,0,.07)"], fill, ghostFill = "rgba(0,0,0,.3)", label, labels = true }: Props) {
  return (
    <div className="radar-pad" data-ui>
      <div className="radar" role="img" aria-label={label ?? "Radar de evolución en 8 categorías"}>
        <svg viewBox="-100 -100 200 200" width="100%" height="100%" aria-hidden="true">
          {[10, 8, 6, 4, 2].map((v, i) => (
            <polygon key={v} points={poly(Array(8).fill(v))} fill={ring[i % 2]} />
          ))}
          <polygon points={poly(values)} fill={fill} />
          {ghost && <polygon points={poly(ghost)} fill={ghostFill} />}
        </svg>
        {labels &&
          SHORT.map((s, k) => {
            const [x, y] = pt(k, 10);
            const side = x > 60 ? "r" : x < -60 ? "l" : "c";
            return (
              <span
                key={s}
                className={`radar-label ${side} ${y < 0 ? "t" : "b"} ${side === "c" ? (x < 0 ? "neg" : "pos") : ""}`}
                style={{ left: `${50 + x / 2}%`, top: `${50 + y / 2}%` }}
                title={CATEGORIES[k]}
              >
                {s}
              </span>
            );
          })}
      </div>
    </div>
  );
}
