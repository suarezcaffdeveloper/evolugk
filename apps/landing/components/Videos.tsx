"use client";
import { useEffect, useRef, useState } from "react";
import { Heading } from "./Heading";

const COMMENTS = [
  { t: 2, label: "0:02", text: "Postura base: peso adelante, manos listas." },
  { t: 9, label: "0:09", text: "Buena lectura. Salí un paso más rápido." },
  { t: 17, label: "0:17", text: "Cerrá el ángulo antes de que patee." },
  { t: 26, label: "0:26", text: "Bien la voz con la defensa." },
  { t: 34, label: "0:34", text: "Excelente reposición. Repetí tres series." },
];

/** Video a pantalla completa. Los comentarios del profe aparecen en el segundo exacto. */
export function Videos() {
  const vid = useRef<HTMLVideoElement>(null);
  const sec = useRef<HTMLElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const v = vid.current;
    const el = sec.current;
    if (!v || !el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !reduce) v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        else {
          v.pause();
          setPlaying(false);
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const visible = COMMENTS.filter((c) => c.t <= time).slice(-3);
  const toggle = () => {
    const v = vid.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };
  const jump = (t: number) => {
    const v = vid.current;
    if (!v) return;
    v.currentTime = t + 0.05;
    void v.play();
    setPlaying(true);
  };

  return (
    <section id="videos" ref={sec} className="panel videos" aria-label="Video con comentarios">
      <div className="fill">
        <video
          ref={vid}
          src="/video/demo-short.webm"
          poster="/video/demo.jpg"
          muted={muted}
          loop
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          aria-label="Entrenamiento de arqueros"
        />
      </div>
      <div className="scrim scrim-b" />
      <div className="scrim scrim-l videos-side" />

      <div className="videos-in wrap">
        <div className="videos-copy">
          <Heading className="display h-xl">Cada jugada, comentada</Heading>
          <p className="lead rv" style={{ "--d": 1 } as React.CSSProperties}>
            El profesor sube el clip y escribe en el segundo exacto qué corregir o festejar. La familia lo ve
            cuando vos lo publicás.
          </p>
          <ul className="chips rv" style={{ "--d": 2 } as React.CSSProperties}>
            <li>Hasta 3 minutos</li>
            <li>Hasta 1080p</li>
            <li>Borrador → Publicado</li>
            <li>Con consentimiento de imagen</li>
          </ul>
        </div>

        <div className="videos-feed" data-ui aria-live="polite">
          <p className="feed-h">Comentarios del profe</p>
          <ul>
            {visible.map((c) => (
              <li key={c.label} className="feed-item">
                <button onClick={() => jump(c.t)} aria-label={`Ir al segundo ${c.t}`}>
                  <b>{c.label}</b>
                  <span>{c.text}</span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="feed-empty">Esperando el primer comentario…</li>}
          </ul>
        </div>
      </div>

      <div className="videos-bar wrap">
        <button className="vbtn" onClick={toggle} aria-label={playing ? "Pausar" : "Reproducir"}>
          {playing ? "Pausar" : "Reproducir"}
        </button>
        <button className="vbtn" onClick={() => setMuted((m) => !m)} aria-pressed={!muted}>
          {muted ? "Activar sonido" : "Silenciar"}
        </button>
        <span className="vtrack" aria-hidden="true">
          <i style={{ width: `${Math.min(100, (time / 40) * 100)}%` }} />
          {COMMENTS.map((c) => (
            <em key={c.label} style={{ left: `${(c.t / 40) * 100}%` }} />
          ))}
        </span>
      </div>
    </section>
  );
}
