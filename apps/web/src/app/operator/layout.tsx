import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Operador · EvoluGK",
  robots: { index: false },
};

/** Marco del panel del operador: usa la identidad de EvoluGK (no la de una escuela). */
export default function OperatorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <p className="font-display text-xl font-bold">EvoluGK</p>
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold">
            Operador
          </span>
        </div>
        <ThemeToggle />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
