const SHORT = ["Atajada", "Aéreo", "Pies", "Posición", "Reflejos", "Comunic.", "Físico", "Mente"];
const R = 92;
const ang = (k: number) => ((-67.5 + 45 * k) * Math.PI) / 180;
const pt = (k: number, v: number, r = R) => {
  const d = (v / 10) * r;
  return [Math.cos(ang(k)) * d, Math.sin(ang(k)) * d] as const;
};
const poly = (vals: number[]) => vals.map((v, k) => pt(k, v).map((n) => n.toFixed(2)).join(",")).join(" ");
const fmt = (n: number) => Math.round(n * 10) / 10;

type Props = { values: number[]; ghost: number[]; top: number };

/** Radar de 8 categorías con barrido, malla fina y vértices con valor. */
export function RadarPro({ values, ghost, top }: Props) {
  const wedge = (() => {
    const a0 = -0.15, a1 = 0.55;
    const p = (a: number) => `${(Math.cos(a) * R * 1.02).toFixed(1)} ${(Math.sin(a) * R * 1.02).toFixed(1)}`;
    return `M0 0 L${p(a0)} A${R * 1.02} ${R * 1.02} 0 0 1 ${p(a1)} Z`;
  })();

  return (
    <svg className="rp" viewBox="-142 -124 284 248" role="img" aria-label="Radar de evolución en 8 categorías">
      <defs>
        <linearGradient id="rp-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4d96c" stopOpacity=".5" />
          <stop offset="1" stopColor="#f4d96c" stopOpacity=".08" />
        </linearGradient>
        <linearGradient id="rp-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f4d96c" stopOpacity="0" />
          <stop offset="1" stopColor="#f4d96c" stopOpacity=".28" />
        </linearGradient>
        <clipPath id="rp-clip">
          <polygon points={poly(Array(8).fill(10))} />
        </clipPath>
      </defs>

      {[2, 4, 6, 8, 10].map((v) => (
        <polygon key={v} points={poly(Array(8).fill(v))} fill="none" stroke="rgba(246,241,222,.14)" strokeWidth={v === 10 ? 0.9 : 0.6} />
      ))}
      {SHORT.map((_, k) => {
        const [x, y] = pt(k, 10);
        return <line key={k} x1="0" y1="0" x2={x} y2={y} stroke="rgba(246,241,222,.1)" strokeWidth=".6" />;
      })}

      <g clipPath="url(#rp-clip)" className="rp-sweep">
        <g>
          <path d={wedge} fill="url(#rp-sweep)" />
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="9s" repeatCount="indefinite" />
        </g>
      </g>

      <polygon points={poly(ghost)} fill="none" stroke="rgba(246,241,222,.6)" strokeWidth="1.1" strokeDasharray="3 3" />
      <polygon points={poly(values)} fill="url(#rp-fill)" stroke="#f4d96c" strokeWidth="1.8" strokeLinejoin="round" />

      {values.map((v, k) => {
        const [x, y] = pt(k, v);
        return (
          <g key={k}>
            {k === top && <circle className="rp-pulse" cx={x} cy={y} r="4" fill="none" stroke="#f4d96c" strokeWidth="1" />}
            <circle cx={x} cy={y} r="3.2" fill="#f4d96c" stroke="#050d09" strokeWidth="1.4" />
          </g>
        );
      })}

      {SHORT.map((s, k) => {
        const [x, y] = pt(k, 10, R + 13);
        const side = x > 40 ? "start" : x < -40 ? "end" : "middle";
        return (
          <text key={s} x={x} y={y} textAnchor={side} className="rp-label">
            <tspan x={x} dy={y < 0 ? "-0.55em" : "0.1em"} className="rp-name">{s}</tspan>
            <tspan x={x} dy="1.25em" className="rp-val">{fmt(values[k])}</tspan>
          </text>
        );
      })}
    </svg>
  );
}
