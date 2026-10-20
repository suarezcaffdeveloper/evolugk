"use client";
import { useState } from "react";
import Image from "next/image";
import { Heading } from "./Heading";
import { AnimatePresence, motion } from "motion/react";
import { FAQ } from "@/lib/content";

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="preguntas" className="panel faq" aria-label="Preguntas frecuentes">
      <div className="faq-photo">
        <Image src="/img/nino-vuelo.jpg" alt="Niño arquero volando hacia el palo" fill sizes="(max-width: 860px) 100vw, 40vw" style={{ objectPosition: "55% 40%" }} />
        <div className="scrim scrim-b" />
        <Heading className="display h-lg faq-h">Preguntas frecuentes</Heading>
      </div>
      <div className="faq-list">
        {FAQ.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q} className="faq-row" data-open={isOpen}>
              <button className="faq-q" aria-expanded={isOpen} aria-controls={`faq-${i}`} onClick={() => setOpen(isOpen ? -1 : i)}>
                <span>{f.q}</span>
                <span className="card-plus" aria-hidden="true" data-open={isOpen} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={`faq-${i}`}
                    role="region"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: "hidden" }}
                  >
                    <p className="faq-a">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
