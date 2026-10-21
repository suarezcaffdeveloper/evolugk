import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClassName = cn(
  "h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-ink",
  "placeholder:text-ink-muted/70",
  "transition-[border-color,box-shadow] duration-150",
  "hover:border-ink-muted/50",
  "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/25",
  "disabled:opacity-60",
);

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClassName, className)} {...props} />;
}

/** Etiqueta, control y mensaje de error asociados entre sí para lectores de pantalla. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Atributos de accesibilidad que enlazan un control con su pista y su error. */
export function describedBy(id: string, { error, hint }: { error?: string; hint?: string }) {
  const ids = [error ? `${id}-error` : hint ? `${id}-hint` : null].filter(Boolean).join(" ");
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": ids || undefined,
  } as const;
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm font-medium text-danger"
    >
      {children}
    </p>
  );
}
