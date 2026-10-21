import Image from "next/image";
import { cn } from "@/lib/cn";

/** Iniciales para el avatar cuando la escuela todavía no cargó su logo. */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  const letters = words.slice(0, 2).map((w) => Array.from(w.match(/\p{L}/u)?.[0] ?? "")[0]);
  return letters.join("").toLocaleUpperCase("es-AR") || "?";
}

/** Logo de la escuela, o sus iniciales sobre el color de la escuela si no tiene logo. */
export function SchoolLogo({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={`Logo de ${name}`}
        width={44}
        height={44}
        unoptimized
        className={cn(
          "h-11 w-11 rounded-control border border-line bg-surface object-contain",
          className,
        )}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-accent font-display text-lg font-bold text-on-accent",
        className,
      )}
    >
      {initialsOf(name)}
    </div>
  );
}
