"use client";
import { useRef } from "react";
import Image from "next/image";
import { motion, MotionValue, useScroll, useTransform, useReducedMotion } from "motion/react";

const TEXT = "Un arquero no se mide por lo que ataja. Se mide por lo que mejora.";
const WORDS = TEXT.split(" ");

function Word({ w, p, range, gold }: { w: string; p: MotionValue<number>; range: [number, number]; gold: boolean }) {
  const opacity = useTransform(p, range, [0.16, 1]);
  return (
    <motion.span style={{ opacity }} className={gold ? "gold" : undefined}>
      {w}{" "}
    </motion.span>
  );
}

/** Un párrafo que se enciende palabra por palabra mientras la imagen respira detrás. */
export function Statement() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const scale = useTransform(p, [0, 1], [1.18, 1]);
  const y = useTransform(p, [0, 1], ["-4%", "4%"]);
  const gold = new Set(["mejora."]);

  return (
    <section id="idea" ref={ref} className="statement" aria-label="La idea">
      <div className="statement-stick">
        <motion.div className="fill" style={reduce ? undefined : { scale, y }}>
          <Image src="/img/arquero-vuelo-bn.jpg" alt="Arquero en blanco y negro volando hacia la pelota" fill sizes="100vw" style={{ objectPosition: "60% 50%" }} />
        </motion.div>
        <div className="scrim scrim-flat" />
        <div className="statement-in wrap">
          <p className="display h-lg statement-text" aria-label={TEXT}>
            {WORDS.map((w, i) => {
              const a = 0.04 + (i / WORDS.length) * 0.82;
              return <Word key={i} w={w} p={p} range={[a, a + 0.1]} gold={gold.has(w)} />;
            })}
          </p>
        </div>
      </div>
    </section>
  );
}
