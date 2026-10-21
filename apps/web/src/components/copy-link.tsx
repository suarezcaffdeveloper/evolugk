"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/field";
import { cn } from "@/lib/cn";

/** Link de solo lectura con un botón para copiarlo (se muestra al invitar, por si el mail no llega). */
export function CopyLink({
  link,
  label = "Link de la invitación",
}: {
  link: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso para el portapapeles: se selecciona el texto para copiarlo a mano.
      input.current?.select();
    }
  }

  return (
    <div className="flex gap-2">
      <input
        ref={input}
        readOnly
        value={link}
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        className={cn(inputClassName, "min-w-0 flex-1 text-sm")}
      />
      <Button type="button" variant="secondary" onClick={copy} className="shrink-0">
        {copied ? "¡Copiado!" : "Copiar"}
      </Button>
    </div>
  );
}
