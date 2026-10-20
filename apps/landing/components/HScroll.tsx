"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { Heading } from "./Heading";
import { motion, useScroll, useTransform, useMotionValueEvent } from "motion/react";

const N = 5;

function Eval() {
  const rows = [["Atajada", 8], ["Reflejos", 9], ["Posicionamiento", 7], ["Comunicación", 8]] as const;
  return (
    <div className="mini" data-ui>
      <p className="mini-h">Nueva evaluación · Mateo</p>
      {rows.map(([n, v]) => (
        <div className="mini-row" key={n}>
          <span>{n}</span>
          <span className="meter"><i style={{ width: `${v * 10}%` }} /></span>
          <b>{v}</b>
        </div>
      ))}
      <span className="mini-btn">Publicar</span>
    </div>
  );
}

function Attendance() {
  const names = ["Mateo R.", "Lucía G.", "Tomás B.", "Valentina S.", "Joaquín P."];
  const [s, setS] = useState<Record<string, "p" | "a" | "j">>({ "Mateo R.": "p", "Lucía G.": "p", "Tomás B.": "a" });
  const cycle = (n: string) => setS((o) => ({ ...o, [n]: o[n] === "p" ? "a" : o[n] === "a" ? "j" : "p" }));
  const all = () => setS(Object.fromEntries(names.map((n) => [n, "p"])) as Record<string, "p">);
  const L = { p: "Presente", a: "Ausente", j: "Justificada" } as const;
  return (
    <div className="mini" data-ui>
      <p className="mini-h">Grupo Sub-12 · Martes</p>
      {names.map((n) => (
        <button className="mini-row mini-click" key={n} onClick={() => cycle(n)} data-s={s[n] ?? "x"}>
          <span>{n}</span>
          <b>{s[n] ? L[s[n]] : "Sin marcar"}</b>
        </button>
      ))}
      <button className="mini-btn" onClick={all}>Todos presentes</button>
    </div>
  );
}

function Comment() {
  return (
    <div className="mini" data-ui>
      <p className="mini-h">Clip · Salida al centro</p>
      <div className="mini-timeline">
        <i style={{ left: "18%" }} /><i style={{ left: "46%" }} /><i style={{ left: "74%" }} />
        <span className="mini-playhead" />
      </div>
      <div className="mini-bubble"><b>0:11</b> Buena lectura. Salí un paso más rápido.</div>
      <div className="mini-bubble"><b>0:19</b> Bien la voz con la defensa.</div>
    </div>
  );
}

function Pin() {
  return (
    <div className="mini" data-ui>
      <p className="mini-h">Ingreso de familias</p>
      <div className="mini-field"><small>Código</small><b>FAM-482</b></div>
      <div className="mini-pin">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} />)}</div>
      <span className="mini-btn">Entrar</span>
      <p className="mini-foot">Sin contraseña. La sesión dura 30 días.</p>
    </div>
  );
}

function Fees() {
  const items = [["Cuota de octubre", "Pagada", "ok"], ["Cuota de noviembre", "Por vencer", "warn"], ["Aviso 2 de 4", "Enviado hoy · 9:00", "info"]] as const;
  return (
    <div className="mini" data-ui>
      <p className="mini-h">Cuotas · Resumen</p>
      {items.map(([a, b, k]) => (
        <div className="mini-row" key={a} data-k={k}>
          <span>{a}</span>
          <b>{b}</b>
        </div>
      ))}
      <p className="mini-foot">Sin duplicados. Todos los días a las 9:00.</p>
    </div>
  );
}

const SLIDES = [
  { title: "Evaluá en menos de un minuto.", text: "8 categorías, puntaje de 1 a 10 y una nota. Queda en borrador hasta que la publicás.", img: "/img/tecnica.jpg", pos: "60% 40%", ui: <Eval /> },
  { title: "Tomá asistencia con un toque.", text: "Botón “todos presentes”, justificadas e invitados. El porcentaje se calcula sobre los últimos 90 días.", img: "/img/nino-vuelo.jpg", pos: "50% 45%", ui: <Attendance /> },
  { title: "Comentá cada jugada en video.", text: "Clips de hasta 3 minutos, con comentarios del profe en el segundo exacto.", img: "/img/noche-red.jpg", pos: "50% 45%", ui: <Comment /> },
  { title: "Las familias ven todo.", text: "Entran con un código y un PIN de 6 dígitos. Sin contraseñas, sin registrarse.", img: "/img/arquero-arco.jpg", pos: "50% 60%", ui: <Pin /> },
  { title: "Las cuotas se avisan solas.", text: "Hasta 4 avisos por mail por cuota impaga, sin duplicados, todos los días a las 9:00.", img: "/img/atardecer.jpg", pos: "70% 60%", ui: <Fees /> },
];

/** Galería horizontal anclada: el scroll vertical desplaza cinco pantallas completas. */
export function HScroll() {
  const ref = useRef<HTMLElement>(null);
  const [idx, setIdx] = useState(0);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const x = useTransform(p, [0, 1], ["0vw", `${-(N - 1) * 100}vw`]);
  const fill = useTransform(p, [0, 1], ["0%", "100%"]);
  useMotionValueEvent(p, "change", (v) => setIdx(Math.min(N - 1, Math.round(v * (N - 1)))));

  return (
    <section id="funciones" ref={ref} className="hs" aria-label="Funciones">
      <div className="hs-stick">
        <motion.div className="hs-track" style={{ x }}>
          {SLIDES.map((s, i) => (
            <article className="hs-slide" key={s.title} aria-hidden={idx !== i && undefined}>
              <div className="fill">
                <Image src={s.img} alt="" fill sizes="100vw" style={{ objectPosition: s.pos }} />
              </div>
              <div className="scrim scrim-l" />
              <div className="hs-in wrap">
                <div className="hs-copy">
                  <Heading className="display h-lg">{s.title}</Heading>
                  <p className="lead">{s.text}</p>
                </div>
                <div className="hs-ui">{s.ui}</div>
              </div>
            </article>
          ))}
        </motion.div>
        <div className="hs-progress wrap" aria-hidden="true">
          <span className="hs-count">{idx + 1} / {N}</span>
          <span className="hs-line"><motion.i style={{ width: fill }} /></span>
        </div>
      </div>
    </section>
  );
}
