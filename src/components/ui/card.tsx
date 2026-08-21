import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Plocha s okrajom — najčastejší tvar v celej appke.
 *
 * Doteraz si každý pohľad písal `rounded border border-border bg-surface p-4`
 * sám. Vyzeralo to rovnako len dovtedy, kým sa niekde nezabudlo, a zmena
 * vzhľadu karty znamenala prejsť dvadsať súborov.
 *
 * `elevated` dvíha kartu nad plátno tieňom z návrhu. Tichý okraj stačí
 * takmer vždy; tieň si treba vypýtať vedome, inak z appky bude vrstvený
 * neporiadok.
 */
type CardProps = React.ComponentProps<"div"> & {
  elevated?: boolean;
  /** Bez vnútorného odsadenia — pre zoznamy, ktoré si riadky odsadzujú samy. */
  flush?: boolean;
};

export function Card({ elevated = false, flush = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded border border-border bg-surface",
        flush ? undefined : "p-4",
        elevated && "shadow-lg",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Hlavička karty — nadpis a popis pod ním.
 *
 * Nadpis je `div`, nie `h2`: karta nevie, na akej úrovni v osnove stránky
 * sedí, a natvrdo daná úroveň by čítačke rozbila štruktúru. Kto potrebuje
 * skutočný nadpis, podá si ho ako `children`.
 */
export function CardHeader({
  title,
  description,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Prvok vpravo — spravidla tlačidlo. */
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)} {...props}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="text-sm font-medium text-fg">{title}</div>
        {description ? (
          <p className="text-[13px] leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}
