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

/*
  Dotykový cieľ je súčasťou veľkosti, nie záplata na volajúcom.

  Doteraz bolo `icon` 32 px — teda pod hranicou 44 px, ktorú palec potrebuje —
  a obchádzalo sa to ručne `className="size-11 md:size-8"` na KAŽDOM mieste.
  Takých obchádzok bolo v projekte 148 v 60 súboroch a stačilo raz zabudnúť.

  Teraz je veľkosť na telefóne dotyková a od `md:` sa sťahuje na hustotu,
  ktorú chce myš. Volajúci nemusí robiť nič.
*/
const sizes: Record<ButtonSize, string> = {
  /*
    `sm` je ZÁMERNE aj na telefóne pod 44 px: je to hustá veľkosť do riadkov
    a paneli, kde dotykovú plochu nesie celý riadok. Nikdy ju nedávaj
    tlačidlu, ktoré je na mobile jediným cieľom — na to je `md` alebo `icon`.
  */
  sm: "h-8 px-2 text-body md:h-7",
  md: "h-11 px-3 text-sm md:h-9",
  icon: "size-11 p-0 md:size-8",
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
