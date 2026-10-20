"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Heading } from "./Heading";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const ROLES = [
  {
    key: "Profesor",
    title: "El profe evalúa desde la cancha",
    img: "/img/tecnica.jpg",
    pos: "55% 40%",
    items: ["Evaluación completa en menos de 1 minuto", "Asistencia con “todos presentes”", "Notas rápidas, internas o visibles", "Videos con comentarios por segundo"],
    note: "No ve nada económico.",
  },
  {
    key: "Administrador",
    title: "La escuela, ordenada",
    img: "/img/arquero-tiro-libre.jpg",
    pos: "30% 40%",
    items: ["Panel de arqueros activos y cuotas vencidas", "Grupos, profesores e invitaciones por mail", "Importación masiva y detección de duplicados", "Marca de la escuela: logo y color"],
    note: "Ve todo, incluidas las cuotas.",
  },
  {
    key: "Familia",
    title: "Las familias, adentro del proceso",
    img: "/img/nino-vuelo.jpg",
    pos: "50% 40%",
    items: ["Ingreso con código y PIN, sin contraseñas", "Evolución: ingreso vs. hoy y línea de tiempo", "Videos y comentarios del profe", "Asistencia y estado de la cuota"],
    note: "Solo ve a sus hijos.",
  },
];

/** Slider a pantalla completa: arrastrá, usá las flechas del teclado o los botones. */
export function Roles() {
  const [[i, dir], setState] = useState<[number, number]>([0, 1]);
  const reduce = useReducedMotion();
  const go = useCallback((n: number) => setState(([cur]) => [(n + ROLES.length) % ROLES.length, n > cur || (cur === ROLES.length - 1 && n === 0) ? 1 : -1]), []);
  const next = () => go(i + 1);
  const prev = () => go(i - 1);
  const r = ROLES[i];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.getElementById("equipo");
      if (!el) return;
      const b = el.getBoundingClientRect();
      if (b.top > window.innerHeight * 0.5 || b.bottom < window.innerHeight * 0.5) return;
      if (e.key === "ArrowRight") go(i + 1);
      if (e.key === "ArrowLeft") go(i - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, go]);

  return (
    <section id="equipo" className="panel roles" aria-label="Para cada persona de tu escuela" aria-roledescription="carrusel">
      <AnimatePresence mode="popLayout" custom={dir} initial={false}>
        <motion.div
          key={i}
          className="roles-slide"
          custom={dir}
          initial={reduce ? false : { opacity: 0, x: dir * 120 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -120 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={(_, info) => {
            if (info.offset.x < -90) next();
            else if (info.offset.x > 90) prev();
          }}
          data-cursor="Arrastrá"
        >
          <div className="fill">
            <Image src={r.img} alt="" fill sizes="100vw" style={{ objectPosition: r.pos }} draggable={false} />
          </div>
          <div className="scrim scrim-l" />
          <div className="roles-in wrap">
            <div>
              <Heading className="display h-lg">{r.title}</Heading>
              <ul className="ticks ticks-lg">
                {r.items.map((t) => (
                  <li key={t}><span className="bullet" /> {t}</li>
                ))}
              </ul>
              <p className="roles-note gold">{r.note}</p>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="roles-bar wrap">
        <div className="roles-tabs" role="tablist" aria-label="Rol">
          {ROLES.map((x, k) => (
            <button key={x.key} role="tab" aria-selected={i === k} className="roles-tab" onClick={() => go(k)}>
              {x.key}
            </button>
          ))}
        </div>
        <div className="roles-arrows">
          <button className="arrow-btn" onClick={prev} aria-label="Anterior">←</button>
          <button className="arrow-btn" onClick={next} aria-label="Siguiente">→</button>
        </div>
      </div>
    </section>
  );
}
