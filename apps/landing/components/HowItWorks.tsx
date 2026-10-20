"use client";
import { useState } from "react";
import Image from "next/image";
import { Heading } from "./Heading";
import { STAGES } from "@/lib/content";

const PHOTOS = [
  { src: "/img/arquero-tiro-libre.jpg", pos: "35% 40%" },
  { src: "/img/arquero-arco.jpg", pos: "50% 55%" },
  { src: "/img/arquero-vuelo-bn.jpg", pos: "60% 50%" },
  { src: "/img/tecnica.jpg", pos: "60% 50%" },
  { src: "/img/joven-guantes.jpg", pos: "50% 25%" },
];

/** Cinco tiras a pantalla completa. La activa se expande y cuenta el paso. */
export function HowItWorks() {
  const [open, setOpen] = useState(0);

  return (
    <section id="como-empezar" className="panel how" aria-label="Cómo empezar">
      <div className="how-title wrap">
        <Heading className="display h-lg">Cómo empezar</Heading>
        <p className="lead rv" style={{ "--d": 1 } as React.CSSProperties}>
          En una tarde dejás la escuela armada. Desde ahí, cada evaluación y cada video alimentan la evolución de los chicos.
        </p>
      </div>
      <div className="strips" role="tablist" aria-label="Etapas">
        {STAGES.map((s, i) => {
          const isOpen = open === i;
          return (
            <div key={s.name} className="strip" data-open={isOpen}>
              <div className="fill">
                <Image src={PHOTOS[i].src} alt="" fill sizes="(max-width: 860px) 100vw, 60vw" style={{ objectPosition: PHOTOS[i].pos }} />
              </div>
              <div className="scrim strip-scrim" />
              <button
                role="tab"
                aria-selected={isOpen}
                aria-expanded={isOpen}
                className="strip-btn"
                onClick={() => setOpen(i)}
                onMouseEnter={() => window.matchMedia("(hover: hover)").matches && setOpen(i)}
              >
                <span className="strip-name">{s.name}</span>
              </button>
              <p className="strip-text" aria-hidden={!isOpen}>{s.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
