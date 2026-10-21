"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type PortalNavItem = { href: string; label: string };

/** Navegación del portal: la sección abierta queda marcada también para lectores de pantalla. */
export function PortalNav({ items }: { items: PortalNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del portal" className="flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-11 shrink-0 items-center rounded-control px-4 text-sm font-semibold transition-colors",
              active
                ? "bg-accent text-on-accent"
                : "text-ink-muted hover:bg-accent-soft hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
