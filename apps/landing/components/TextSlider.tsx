"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/** Frases que se deslizan una detrás de otra, dentro de una ventana con máscara. */
export function TextSlider({ items, interval = 2800, className = "" }: { items: string[]; interval?: number; className?: string }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % items.length), interval);
    return () => clearInterval(t);
  }, [items.length, interval, reduce]);

  return (
    <span className={`tslide ${className}`} aria-live="polite" aria-atomic="true">
      <span className="tslide-win">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={i}
            className="tslide-item"
            initial={reduce ? false : { y: "105%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: "-105%", opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {items[i]}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
