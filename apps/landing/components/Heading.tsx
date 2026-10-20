"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  children: string;
  className?: string;
  as?: React.ElementType;
  delay?: number;
};

/** Título que se desliza hacia arriba, palabra por palabra, cuando entra en pantalla. */
export function Heading({ children, className = "", as: Tag = "h2", delay = 0 }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={`${className} hd`} data-in={on} aria-label={children}>
      {children.split(" ").map((w, i) => (
        <span className="word" aria-hidden="true" key={i}>
          <span style={{ "--i": i + delay } as React.CSSProperties}>{w}&nbsp;</span>
        </span>
      ))}
    </Tag>
  );
}
