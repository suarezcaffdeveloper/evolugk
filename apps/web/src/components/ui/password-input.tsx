"use client";

import { useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { inputClassName } from "./field";

/** Campo de contraseña con botón para mostrarla u ocultarla. */
export function PasswordInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={cn(inputClassName, "pr-24", className)}
        autoCapitalize="none"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        className="absolute inset-y-1 right-1 rounded-[8px] px-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-accent-soft hover:text-ink"
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
