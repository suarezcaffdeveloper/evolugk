"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { tween, usePrefersReducedMotion } from "@/lib/motion";

/** Número que cuenta hasta su valor (es-AR). Con "reducir movimiento" aparece directo. */
export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  duration = 900,
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  const last = useRef(0);

  useEffect(() => {
    const from = last.current;
    if (reduced) {
      const id = requestAnimationFrame(() => {
        last.current = value;
        setShown(value);
      });
      return () => cancelAnimationFrame(id);
    }
    return tween(duration, (t) => {
      const next = from + (value - from) * t;
      last.current = next;
      setShown(next);
    });
  }, [value, duration, reduced]);

  const format = useMemo(
    () =>
      new Intl.NumberFormat("es-AR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    [decimals],
  );

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {format.format(shown)}
      {suffix}
    </span>
  );
}
