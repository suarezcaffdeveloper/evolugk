"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { DEMO_LINK } from "@/lib/content";
import { TextSlider } from "./TextSlider";

const SLIDES = [
  { src: "/img/arquero-atajada.jpg", alt: "Arquero estirándose en el aire para atajar un remate", tag: "Atajada", pos: "50% 30%" },
  { src: "/img/nino-vuelo.jpg", alt: "Niño arquero volando hacia el palo", tag: "Cantera", pos: "50% 40%" },
  { src: "/img/atardecer.jpg", alt: "Silueta de un arquero sujetando la pelota al atardecer", tag: "Entrenamiento", pos: "60% 60%" },
  { src: "/img/noche-red.jpg", alt: "Arquero visto desde la red durante una tanda de penales", tag: "Presión", pos: "50% 40%" },
  { src: "/img/joven-guantes.jpg", alt: "Joven arquero sonriendo con los guantes arriba", tag: "Pasión", pos: "50% 28%" },
];
const DURATION = 6500;

const words = (t: string, start = 0) =>
  t.split(" ").map((w, i) => (
    <span className="word" key={i}>
      <span style={{ "--i": start + i } as React.CSSProperties}>{w}&nbsp;</span>
    </span>
  ));

export function Hero() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setI((n) => (n + 1) % SLIDES.length), DURATION);
    return () => clearTimeout(t);
  }, [i, paused]);

  return (
    <section id="top" className="panel hero" aria-label="Inicio">
      <div className="fill">
        {SLIDES.map((s, k) => (
          <div key={s.src} className="slide" data-on={i === k}>
            <Image src={s.src} alt={i === k ? s.alt : ""} fill priority={k === 0} sizes="100vw" style={{ objectPosition: s.pos }} />
          </div>
        ))}
      </div>
      <div className="scrim scrim-l" />
      <div className="scrim hero-vignette" />

      <div className="hero-text wrap">
        <h1 className="display h-xl hero-h1">
          {words("Cada arquero", 0)}
          <br />
          {words("evoluciona", 2)}
        </h1>
        <p className="hero-slider rv" style={{ "--d": 3 } as React.CSSProperties}>
          <span className="bullet" />
          <TextSlider items={["Evaluá en un minuto.", "Subí videos comentados.", "Mostrales la evolución a las familias.", "Controlá asistencia y cuotas."]} />
        </p>
        <p className="lead hero-lead rv" style={{ "--d": 4 } as React.CSSProperties}>
          El sistema para escuelas de arqueros. Evaluá en un minuto, subí videos y mostrale a cada familia cómo
          llegó y cómo está hoy.
        </p>
        <div className="hero-actions rv" style={{ "--d": 5 } as React.CSSProperties}>
          <a className="btn" href={DEMO_LINK} target="_blank" rel="noopener noreferrer">
            Pedí una demo <span className="arrow" aria-hidden="true">→</span>
          </a>
          <a className="btn ghost" href="#idea">
            Ver cómo funciona
          </a>
        </div>
      </div>

      <div className="hero-bar wrap">
        <div
          className="hero-slides"
          role="tablist"
          aria-label="Escenas"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {SLIDES.map((s, k) => (
            <button key={s.tag} role="tab" aria-selected={i === k} className="hero-tab" data-on={i === k} data-done={k < i} onClick={() => setI(k)}>
              <span className="hero-tab-bar">
                <i
                  key={i === k ? `on-${i}` : "off"}
                  style={{ animationDuration: `${DURATION}ms`, animationPlayState: paused ? "paused" : "running" }}
                />
              </span>
              <span className="hero-tab-name">{s.tag}</span>
            </button>
          ))}
        </div>
        <a className="hero-scroll" href="#idea" aria-label="Seguir bajando">
          <span>Deslizá</span>
          <i />
        </a>
      </div>

      <div className="hero-chip" data-ui>
        <span className="chip-k">Evaluación publicada</span>
        <span className="chip-v">
          Reflejos <b>5</b> → <b className="gold">8</b>
        </span>
      </div>
    </section>
  );
}
