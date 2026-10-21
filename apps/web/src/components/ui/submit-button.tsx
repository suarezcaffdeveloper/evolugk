"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

/** Botón de envío: se deshabilita y cambia el texto mientras la acción está en curso. */
export function SubmitButton({
  children,
  pendingText,
  ...props
}: Omit<ButtonProps, "type"> & { children: ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} {...props}>
      {pending && (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 animate-spin"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <path d="M12 3a9 9 0 1 0 9 9" />
        </svg>
      )}
      {pending ? pendingText : children}
    </Button>
  );
}
