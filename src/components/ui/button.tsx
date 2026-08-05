import type * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon";

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * Spoločný základ. Prechody sú zámerne krátke (100 ms) — tlačidlo má
 * reagovať okamžite, nie „doplávať" do stavu.
 */
const base = [
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5",
  "whitespace-nowrap rounded border font-medium leading-none",
  "transition-[background-color,border-color,color,opacity] duration-100 ease-out",
  "disabled:pointer-events-none disabled:opacity-45",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0",
].join(" ");

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-accent text-accent-fg hover:bg-accent/90 active:bg-accent/80",
  secondary:
    "border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2 active:bg-surface-2",
  ghost:
    "border-transparent bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-surface-2 active:text-fg",
  danger:
    "border-transparent bg-danger text-accent-fg hover:bg-danger/90 active:bg-danger/80",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2 text-[13px]",
  md: "h-9 px-3 text-sm",
  icon: "size-8 p-0",
};

/**
 * Základné tlačidlo. Predvolený variant je `secondary` — v hustom nástroji
 * má byť väčšina tlačidiel tichá a primárnu akciu si treba vypýtať vedome.
 */
export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
