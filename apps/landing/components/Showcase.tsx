"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { RadarPro } from "./RadarPro";
import { Heading } from "./Heading";
import { CATEGORIES, RADAR_HOY, RADAR_INGRESO } from "@/lib/content";

const MONTHS = ["Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct"];
/** Cuánto del camino ingreso → hoy se recorrió en cada mes (no es lineal: hay mesetas y saltos). */
const P = [0, 0.1, 0.2, 0.18, 0.42, 0.62, 0.82, 1];
const LAG = [0, 0.05, 0.1, 0, 0.15, 0.08, 0.12, 0.03];

const avg = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
const fmt = (n: number) => n.toFixed(1).replace(".", ",");
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const progressAt = (t: number) => {
  const pos = (t / 100) * (P.length - 1);
  const i = Math.min(P.length - 2, Math.floor(pos));
  return P[i] + (P[i + 1] - P[i]) * (pos - i);
};

/** Curva suave que pasa por los puntos (Catmull-Rom → Bézier). */
function smooth(pts: [number, number][]) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const W = 600, H = 110, PAD = 14;

export function Showcase() {
  const [t, setT] = useState(0);
  const [seen, setSeen] = useState(false);
  const touched = useRef(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        setSeen(true);
        if (reduced) return setT(100);
        const start = performance.now() + 500;
        const run = (now: number) => {
          if (touched.current) return;
          const p = clamp((now - start) / 4200);
          setT(Math.round((1 - Math.pow(1 - p, 3)) * 100));
          if (p < 1) raf = requestAnimationFrame(run);
        };
        raf = requestAnimationFrame(run);
      },
      { threshold: 0.45 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const prog = progressAt(t);
  const values = RADAR_INGRESO.map((v, i) => v + (RADAR_HOY[i] - v) * clamp((prog - LAG[i]) / (1 - LAG[i])));
  const a0 = avg(RADAR_INGRESO);
  const aNow = avg(values);
  const monthAvg = P.map((p) => a0 + (avg(RADAR_HOY) - a0) * p);
  const lo = Math.min(...monthAvg), hi = Math.max(...monthAvg);
  const yOf = (v: number) => H - PAD - ((v - lo) / (hi - lo || 1)) * (H - PAD * 2);
  const pts: [number, number][] = monthAvg.map((v, i) => [(i / (P.length - 1)) * W, yOf(v)]);
  const line = smooth(pts);
  const area = `${line} L${W},${H} L0,${H} Z`;
  const gains = values.map((v, i) => v - RADAR_INGRESO[i]);
  const topIdx = gains.indexOf(Math.max(...gains));
  const mIdx = Math.round((t / 100) * (MONTHS.length - 1));
  const curY = yOf(a0 + (avg(RADAR_HOY) - a0) * prog);

  return (
    <section id="evolucion" ref={ref} className="panel evo2" aria-label="Evolución del arquero">
      <div className="evo2-photo">
        <Image src="/img/joven-guantes.jpg" alt="Joven arquero sonriendo con los guantes arriba" fill sizes="(max-width: 960px) 100vw, 38vw" style={{ objectPosition: "50% 22%" }} />
        <div className="scrim scrim-b" />
        <div className="evo2-tag" data-ui>
          <b>Mateo, 12 años</b>
          <span>Ejemplo · Nivel intermedio</span>
        </div>
      </div>

      <div className="evo2-body">
        <Heading className="display h-md evo2-h">Su evolución, a la vista</Heading>

        <div className="edge dash" data-ui>
          <div className="edge-in dash-in">
            <div className="dash-top">
              <div>
                <p className="dash-k">Promedio general</p>
                <p className="dash-big" aria-live="polite">
                  {fmt(aNow)}
                  <span className="dash-delta">▲ {fmt(aNow - a0)}</span>
                </p>
              </div>
              <div className="dash-state" data-hoy={t >= 100}>
                <i /> {t >= 100 ? "Hoy" : t <= 0 ? "Ingreso" : "Evolucionando"} · {MONTHS[mIdx]} 2026
              </div>
            </div>

            <div className="dash-mid">
              <div className="dash-radar">
                <RadarPro values={values} ghost={RADAR_INGRESO} top={topIdx} />
              </div>
              <ul className="dash-bars" aria-label="Puntaje por categoría">
                {CATEGORIES.map((c, i) => (
                  <li key={c}>
                    <span className="bar-name">{c}</span>
                    <span className="bar-track">
                      <i className="bar-fill" style={{ width: `${values[i] * 10}%` }} />
                      <em className="bar-ghost" style={{ left: `${RADAR_INGRESO[i] * 10}%` }} />
                    </span>
                    <b className="bar-val">{fmt(values[i])}</b>
                  </li>
                ))}
              </ul>
            </div>

            <div className="dash-chart">
              <div className="chart-box" data-cursor="Arrastrá">
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="ch-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#f4d96c" stopOpacity=".38" />
                      <stop offset="1" stopColor="#f4d96c" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0.25, 0.5, 0.75].map((g) => (
                    <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(246,241,222,.07)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  ))}
                  <path d={area} fill="url(#ch-fill)" className="chart-area" data-seen={seen} />
                  <path d={line} fill="none" stroke="#f4d96c" strokeWidth="2.2" strokeLinecap="round" pathLength={1} className="chart-line" data-seen={seen} vectorEffect="non-scaling-stroke" />
                </svg>
                {pts.map(([x, y], i) => (
                  <i key={i} className="chart-dot" data-on={i <= mIdx} style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }} />
                ))}
                <span className="chart-cursor" style={{ left: `${t}%` }}>
                  <b style={{ top: `${(curY / H) * 100}%` }} />
                </span>
                <input
                  className="chart-range"
                  type="range"
                  min={0}
                  max={100}
                  value={t}
                  aria-label="Recorrer la evolución mes a mes"
                  aria-valuetext={`${MONTHS[mIdx]}, promedio ${fmt(aNow)}`}
                  onChange={(e) => {
                    touched.current = true;
                    setT(Number(e.target.value));
                  }}
                />
              </div>
              <ol className="chart-months">
                {MONTHS.map((m, i) => (
                  <li key={m} data-on={i === mIdx}>{m}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
        <p className="small evo2-note">Datos de ejemplo. Puntajes de 1 a 10 en cada categoría.</p>
      </div>
    </section>
  );
}
