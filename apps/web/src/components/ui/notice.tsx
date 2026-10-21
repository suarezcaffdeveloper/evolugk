import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-ink",
  info: "border-line bg-accent-soft text-ink",
} as const;

/** Aviso que no es un error de formulario (confirmaciones, advertencias, información). */
export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-control border px-3 py-2.5 text-sm font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
