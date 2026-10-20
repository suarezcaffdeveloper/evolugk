"use client";
import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { CHAPTERS } from "@/lib/content";

/** Scroll suave, barra de progreso, puntos de capítulo y cursor propio. */
export function Chrome() {
  const bar = useRef<HTMLElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState("top");
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let cursorRaf = 0;
    let lenis: Lenis | null = null;

    const setProgress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      bar.current?.style.setProperty("--p", String(Math.min(1, Math.max(0, p))));
      document.documentElement.dataset.scrolled = window.scrollY > 40 ? "true" : "false";
    };

    if (!reduce) {
      lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, anchors: true });
      lenisRef.current = lenis;
      (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
      const loop = (t: number) => {
        lenis!.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    window.addEventListener("scroll", setProgress, { passive: true });
    setProgress();

    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -45% 0px" }
    );
    CHAPTERS.forEach((c) => {
      const el = document.getElementById(c.id);
      if (el) io.observe(el);
    });

    // cursor propio (solo con mouse)
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let mx = -100, my = -100, cx = -100, cy = -100;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      const t = e.target as HTMLElement | null;
      const c = cursor.current;
      if (!c || !t) return;
      const drag = t.closest("[data-cursor]") as HTMLElement | null;
      c.dataset.hover = String(!!t.closest("a, button, input, [role=tab], [role=radio], [role=switch]"));
      c.dataset.label = String(!!drag);
      if (label.current) label.current.textContent = drag?.dataset.cursor ?? "";
    };
    const onDown = () => cursor.current && (cursor.current.dataset.down = "true");
    const onUp = () => cursor.current && (cursor.current.dataset.down = "false");
    const tick = () => {
      cx += (mx - cx) * 0.22;
      cy += (my - cy) * 0.22;
      if (cursor.current) cursor.current.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      cursorRaf = requestAnimationFrame(tick);
    };
    if (fine) {
      document.documentElement.classList.add("cursor-on");
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("mousedown", onDown);
      window.addEventListener("mouseup", onUp);
      cursorRaf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(cursorRaf);
      lenis?.destroy();
      io.disconnect();
      window.removeEventListener("scroll", setProgress);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      document.documentElement.classList.remove("cursor-on");
    };
  }, []);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el, { duration: 1.6 });
    else el.scrollIntoView();
  };

  return (
    <>
      <div className="progress" aria-hidden="true">
        <i ref={bar as React.RefObject<HTMLElement>} />
      </div>
      <nav className="dots" aria-label="Capítulos">
        {CHAPTERS.map((c) => (
          <button key={c.id} className="dot" aria-label={c.label} aria-current={active === c.id} onClick={() => go(c.id)}>
            <span>{c.label}</span>
          </button>
        ))}
      </nav>
      <div className="cursor" ref={cursor} aria-hidden="true">
        <div className="cursor-ring" />
        <span className="cursor-label" ref={label} />
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  );
}
