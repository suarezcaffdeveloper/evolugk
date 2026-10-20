"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Heading } from "./Heading";
import { FACTS, ROADMAP } from "@/lib/content";

function parse(v: string) {
  const m = v.match(/^(\d+)(.*)$/);
  return m ? { n: Number(m[1]), suffix: m[2] } : { n: 0, suffix: v };
}

function Count({ value }: { value: string }) {
  const { n, suffix } = parse(value);
  const [x, setX] = useState(n);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || n === 0) return;
    setX(0);
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const run = (now: number) => {
          const p = Math.min((now - start) / 1600, 1);
          setX(Math.round((1 - Math.pow(1 - p, 3)) * n));
          if (p < 1) raf = requestAnimationFrame(run);
        };
        raf = requestAnimationFrame(run);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [n]);

  return <span ref={ref}>{x}{suffix}</span>;
}

export function Facts() {
  const items = [...ROADMAP, ...ROADMAP];
  return (
    <section id="datos" className="panel facts" aria-label="El sistema en números">
      <div className="fill">
        <Image src="/img/atardecer.jpg" alt="" fill sizes="100vw" style={{ objectPosition: "70% 50%" }} />
      </div>
      <div className="scrim scrim-flat" />
      <div className="facts-in wrap">
        <Heading className="display h-lg">Hecho para la cancha</Heading>
        <div className="facts-grid">
          {FACTS.slice(0, 6).map((f, i) => (
            <div key={f.label} className="fact rv" style={{ "--d": i } as React.CSSProperties}>
              <p className="fact-v display"><Count value={f.value} /></p>
              <p className="fact-l">{f.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="ticker" aria-label="Próximamente">
        <p className="ticker-h">Próximamente</p>
        <div className="marquee">
          <div className="marquee-track">
            {items.map((r, i) => (
              <span key={i} aria-hidden={i >= ROADMAP.length} className="ticker-item">
                {r}
                <span className="bullet" />
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
