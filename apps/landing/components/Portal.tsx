"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Heading } from "./Heading";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { Radar } from "./Radar";
import { RADAR_HOY, RADAR_INGRESO } from "@/lib/content";
import { LogoMark } from "./Nav";

const TABS = ["Inicio", "Evolución", "Videos", "Asistencia", "Cuota"] as const;
const COLORS = [
  { name: "Verde", v: "#187a41" },
  { name: "Azul", v: "#2456c9" },
  { name: "Rojo", v: "#c93a3a" },
  { name: "Celeste", v: "#14769f" },
  { name: "Naranja", v: "#b45309" },
];
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);
const PRESENT = new Set([2, 4, 6, 9, 11, 13, 16, 18, 20, 23, 25, 27]);
const ABSENT = new Set([14]);
const JUSTIF = new Set([21]);

function Screen({ tab }: { tab: (typeof TABS)[number] }) {
  switch (tab) {
    case "Inicio":
      return (
        <div className="pt-stack">
          <p className="pt-hello">Hola, familia de Mateo</p>
          <div className="pt-card"><span className="pt-new">Nuevo</span><strong>Evaluación publicada</strong><span>Reflejos pasó de 5 a 8</span></div>
          <div className="pt-card"><span className="pt-new">Nuevo</span><strong>Video comentado</strong><span>“Cerrá el ángulo antes de que patee.”</span></div>
          <div className="pt-card"><strong>Asistencia</strong><span>92% en los últimos 90 días</span></div>
        </div>
      );
    case "Evolución":
      return (
        <div className="pt-stack">
          <p className="pt-hello">Ingreso vs. hoy</p>
          <div className="pt-radar">
            <Radar values={RADAR_HOY} ghost={RADAR_INGRESO} fill="var(--pt)" ghostFill="rgba(255,255,255,.5)" ring={["rgba(20,30,25,.08)", "rgba(20,30,25,.03)"]} labels={false} />
          </div>
        </div>
      );
    case "Videos":
      return (
        <div className="pt-stack">
          <p className="pt-hello">Videos de Mateo</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pt-thumb" src="/video/demo.jpg" alt="Clip de entrenamiento" width={640} height={360} />
          <div className="pt-card"><strong>0:09</strong><span>Buena lectura. Salí un paso más rápido.</span></div>
        </div>
      );
    case "Asistencia":
      return (
        <div className="pt-stack">
          <p className="pt-hello">Asistencia</p>
          <p className="pt-big">92%</p>
          <div className="pt-cal" aria-hidden="true">
            {DAYS.map((d) => (
              <span key={d} data-s={PRESENT.has(d) ? "p" : JUSTIF.has(d) ? "j" : ABSENT.has(d) ? "a" : ""}>{d}</span>
            ))}
          </div>
        </div>
      );
    case "Cuota":
      return (
        <div className="pt-stack">
          <p className="pt-hello">Cuota</p>
          <div className="pt-card"><strong>Octubre</strong><span className="pt-ok">Pagada</span></div>
          <div className="pt-card"><strong>Noviembre</strong><span>Vence el 10 de noviembre</span></div>
        </div>
      );
  }
}

/** Portal de familias con la marca de la escuela. Inclina en 3D con el mouse y se re-tematiza con el color. */
export function Portal() {
  const [tab, setTab] = useState(0);
  const [color, setColor] = useState(0);
  const [auto, setAuto] = useState(true);
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 90, damping: 16 });
  const sy = useSpring(my, { stiffness: 90, damping: 16 });
  const rotY = useTransform(sx, [-1, 1], [-14, 14]);
  const rotX = useTransform(sy, [-1, 1], [10, -10]);
  const floatX = useTransform(sx, [-1, 1], [22, -22]);
  const floatY = useTransform(sy, [-1, 1], [14, -14]);

  useEffect(() => {
    if (!auto || reduce) return;
    const id = setInterval(() => setTab((t) => (t + 1) % TABS.length), 3600);
    return () => clearInterval(id);
  }, [auto, reduce]);

  const onMove = (e: React.MouseEvent) => {
    if (reduce || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width) * 2 - 1);
    my.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <section id="familias" className="panel portal" onMouseMove={onMove} onMouseLeave={onLeave} aria-label="Portal de familias">
      <div className="fill">
        <Image src="/img/noche-red.jpg" alt="" fill sizes="100vw" style={{ objectPosition: "50% 40%" }} />
      </div>
      <div className="scrim scrim-flat" />
      <div className="scrim scrim-l" />

      <div className="portal-in wrap">
        <div className="portal-copy">
          <Heading className="display h-lg">Tu escuela, tu portal</Heading>
          <p className="lead rv" style={{ "--d": 1 } as React.CSSProperties}>
            Las familias entran con un código y un PIN, sin contraseñas. Ven la evolución, los videos, la
            asistencia y el estado de la cuota, con el logo y el color de tu escuela.
          </p>
          <div className="swatches rv" style={{ "--d": 2 } as React.CSSProperties}>
            <p className="swatch-label" id="swl">Probá el color de tu escuela</p>
            <div role="radiogroup" aria-labelledby="swl" className="swatch-row">
              {COLORS.map((c, i) => (
                <button key={c.name} type="button" role="radio" aria-checked={color === i} aria-label={c.name} className="swatch oct" style={{ background: c.v }} onClick={() => setColor(i)} />
              ))}
            </div>
          </div>
        </div>

        <div className="portal-stage" ref={stage}>
          <motion.div className="float f1" style={{ x: floatX, y: floatY }} data-ui>
            <b>Código + PIN</b><span>Sin contraseñas</span>
          </motion.div>
          <motion.div className="float f2" style={{ x: floatX, y: floatY }} data-ui>
            <b>92%</b><span>de asistencia</span>
          </motion.div>
          <motion.div className="phone" style={reduce ? undefined : { rotateY: rotY, rotateX: rotX }}>
            <div className="portal-ui chamfer-box" data-ui style={{ "--pt": COLORS[color].v, "--c": "26px" } as React.CSSProperties}>
              <div className="pt-head">
                <span className="pt-logo"><LogoMark size={26} /></span>
                <span><strong>Escuela de Arqueros Demo</strong><small>Portal de familias</small></span>
              </div>
              <div className="pt-tabs" role="tablist" aria-label="Secciones del portal">
                {TABS.map((t, i) => (
                  <button key={t} role="tab" aria-selected={tab === i} className="pt-tab" onClick={() => { setAuto(false); setTab(i); }}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="pt-body" role="tabpanel">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={tab}
                    initial={reduce ? false : { opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Screen tab={TABS[tab]} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
