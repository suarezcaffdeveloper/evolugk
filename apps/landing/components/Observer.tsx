"use client";
import { useEffect } from "react";

/** Marca con .in los elementos .rv y .shutter al entrar en pantalla (una sola vez). */
export function Observer() {
  useEffect(() => {
    // Un obturador cerrado (clip-path) no cuenta como visible: se observa su contenedor.
    const targets = new Map<Element, HTMLElement>();
    document.querySelectorAll<HTMLElement>(".rv, .shutter").forEach((el) => {
      const watched = el.classList.contains("shutter") ? (el.parentElement as HTMLElement) : el;
      targets.set(watched, el);
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          targets.get(e.target)?.classList.add("in");
          io.unobserve(e.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    targets.forEach((_, watched) => io.observe(watched));
    return () => io.disconnect();
  }, []);
  return null;
}
