import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent shadow-card hover:shadow-card-hover hover:brightness-110",
  secondary: "bg-surface text-ink border border-line hover:bg-accent-soft",
  ghost: "text-ink hover:bg-accent-soft",
  danger: "bg-danger text-on-danger shadow-card hover:brightness-110",
};

// Áreas táctiles de al menos 44 px (md y lg), como pide el brief para el profesor.
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-base",
  lg: "h-12 px-6 text-base",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-control font-semibold",
        "transition-[background-color,box-shadow,transform,filter] duration-150 ease-out-soft",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
