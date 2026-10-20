"use client";
import { useState } from "react";
import Image from "next/image";
import { Heading } from "./Heading";
import { PLANS, PLAN_INCLUDES, waLink } from "@/lib/content";

/** Tres tarjetas negras con borde de color. La que tocás se enciende y gira su borde. */
export function Pricing() {
  const [on, setOn] = useState(1);
  return (
    <section id="planes" className="panel pricing" aria-label="Planes">
      <div className="fill pricing-bg">
        <Image src="/img/arquero-tiro-libre.jpg" alt="" fill sizes="100vw" style={{ objectPosition: "35% 40%" }} />
      </div>
      <div className="scrim scrim-flat pricing-scrim" />

      <div className="pricing-in wrap">
        <div className="pricing-title">
          <Heading className="display h-lg">Un plan para cada escuela</Heading>
          <p className="lead rv" style={{ "--d": 1 } as React.CSSProperties}>
            Todos incluyen todas las funciones. Cambia la cantidad de arqueros y de minutos de video.
          </p>
        </div>

        <div className="pcards">
          {PLANS.map((p, i) => (
            <article
              key={p.name}
              className="pcard rv"
              data-on={on === i}
              style={{ "--d": i + 1 } as React.CSSProperties}
              onMouseEnter={() => window.matchMedia("(hover: hover)").matches && setOn(i)}
              onFocus={() => setOn(i)}
              onClick={() => setOn(i)}
            >
              <div className="pcard-edge" />
              <div className="pcard-in">
                <h3 className="pname">{p.name}</h3>
                <p className="ptext">{p.text}</p>
                <p className="psize">
                  <span className="pn display">{p.size}</span>
                  <span>arqueros, como máximo</span>
                </p>
                <ul className="pincl">
                  {PLAN_INCLUDES.map((x) => (
                    <li key={x}><span className="bullet" /> {x}</li>
                  ))}
                </ul>
                <a
                  className={`pbtn ${on === i ? "solid" : ""}`}
                  href={waLink(`Hola, quiero consultar el precio del plan ${p.name} de EvoluGK (hasta ${p.size} arqueros).`)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Consultá el precio <span aria-hidden="true">→</span>
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
