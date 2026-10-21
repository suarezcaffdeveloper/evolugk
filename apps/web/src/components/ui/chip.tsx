import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "bg-accent-soft text-ink",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
} as const;

/** Etiqueta chica de estado. El color nunca es lo único que informa: siempre lleva texto. */
export function Chip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
