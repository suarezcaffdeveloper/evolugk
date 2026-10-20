"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DEMO_LINK, NAV } from "@/lib/content";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-100 -100 200 200" aria-hidden="true" className="logo-mark">
      <polygon points="-41,-100 41,-100 100,-41 100,41 41,100 -41,100 -100,41 -100,-41" fill="currentColor" />
      <polygon points="-18,-78 42,-52 70,10 22,70 -34,48 -62,-8" fill="#06110b" />
    </svg>
  );
}

const ids = NAV.map((n) => n.href.slice(1));

export function Nav() {
  const [active, setActive] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -45% 0px" }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    const top = () => window.scrollY < 200 && setActive(null);
    window.addEventListener("scroll", top, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", top);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const target = hover ?? active;

  return (
    <header className="nav">
      <div className="nav-in wrap">
        <a href="#top" className="logo" aria-label="EvoluGK, ir al inicio">
          <LogoMark size={26} />
          <span>
            Evolu<b>GK</b>
          </span>
        </a>

        <nav className="nav-pill" aria-label="Principal" onMouseLeave={() => setHover(null)}>
          {NAV.map((n) => {
            const id = n.href.slice(1);
            return (
              <a
                key={id}
                href={n.href}
                className="nav-link"
                data-active={active === id}
                aria-current={active === id ? "true" : undefined}
                onMouseEnter={() => setHover(id)}
                onFocus={() => setHover(id)}
                onBlur={() => setHover(null)}
              >
                {target === id && <motion.span layoutId="nav-ind" className="nav-ind" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                <span className="nav-label">{n.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="nav-right">
          <a className="nav-cta" href={DEMO_LINK} target="_blank" rel="noopener noreferrer">
            <span className="cta-long">Pedí una demo</span>
            <span className="cta-short" aria-hidden="true">Demo</span>
            <i aria-hidden="true">→</i>
          </a>
          <button className="burger" aria-expanded={open} aria-controls="menu" aria-label={open ? "Cerrar menú" : "Abrir menú"} onClick={() => setOpen((o) => !o)}>
            <span data-open={open} />
            <span data-open={open} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div id="menu" className="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <nav className="menu-in wrap" aria-label="Menú">
              {NAV.map((n, i) => (
                <motion.a
                  key={n.href}
                  href={n.href}
                  className="menu-link display"
                  onClick={() => setOpen(false)}
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.08 * i + 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                >
                  {n.label}
                </motion.a>
              ))}
              <motion.a
                className="btn"
                href={DEMO_LINK}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.55, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                Pedí una demo
              </motion.a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
