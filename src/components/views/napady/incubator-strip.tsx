"use client";

import { Ban, Hourglass, Rocket, Sprout } from "lucide-react";

import { AreaDot } from "@/components/task/area-dot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IdeaWithRelations } from "@/server/queries/ideas";

import { agoLabel, touchAgeLabel } from "./idea-labels";
import { SparkMeter } from "./spark-picker";

/* ═══════════════════════════════════════════════════════════════════════════
   INKUBÁTOR — „Vráť sa k týmto"

   Zmysel inkubátora nie je pripomenúť, ale PRINÚTIŤ ROZHODNÚŤ. Pripomienka
   bez rozhodnutia je len ďalšie okno, ktoré sa zavrie; preto sú pri každom
   nápade tri tlačidlá, ktoré ho z pásu naozaj odstránia:

     Povýšiť na projekt · Nechať zrieť (dotyk) · Zahodiť (zamietnutie)

   Keď nie je čo pripomenúť, pás sa nezobrazuje vôbec — prázdny inkubátor by
   len naučil oči preskakovať vrch obrazovky.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface IncubatorItem {
  idea: IdeaWithRelations;
  /**
   * Koľko dní ubehlo od vzniku nápadu. Počíta ho SERVER — v klientovi by
   * `new Date()` po hydratácii dal iné číslo a v inom pásme aj iný deň.
   */
  ageDays: number;
}

export interface IncubatorStripProps {
  items: IncubatorItem[];
  /** Po koľkých dňoch bez dotyku sa nápad do pásu dostane (z nastavení). */
  afterDays: number;
  onPromote: (idea: IdeaWithRelations) => void;
  onKeep: (idea: IdeaWithRelations) => void;
  onDiscard: (idea: IdeaWithRelations) => void;
}

/** Rozhodovacie tlačidlá: palec pod `sm`, hustota od `sm`. */
const DECISION_BUTTON = "h-11 flex-1 px-2.5 sm:h-8";

export function IncubatorStrip({
  items,
  afterDays,
  onPromote,
  onKeep,
  onDiscard,
}: IncubatorStripProps) {
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="inkubator"
      className="flex flex-col gap-3 rounded border border-border bg-accent-soft px-3 py-3"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Sprout aria-hidden="true" size={16} className="shrink-0 text-accent" />
          <h2
            id="inkubator"
            className="min-w-0 text-sm font-semibold tracking-tight text-fg"
          >
            Vráť sa k týmto
          </h2>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
          Nikto sa ich nedotkol aspoň {afterDays} dní. Nepýtame sa, či si na ne
          nezabudol — pýtame sa, čo s nimi. Každý z nich odtiaľto odíde jedným
          z troch rozhodnutí.
        </p>
      </div>

      {/* Tri nápady vedľa seba od `md`, pod tým pod sebou — na 375 px by sa
          trojica kariet s tromi tlačidlami nedala prečítať ani stlačiť. */}
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
        {items.map(({ idea, ageDays }) => {
          const title = idea.title.trim();
          return (
            <li
              key={idea.id}
              className="flex min-w-0 flex-col gap-2 rounded border border-border bg-surface px-3 py-2.5"
            >
              <p className="min-w-0 text-sm leading-snug font-medium break-words text-fg">
                {title}
              </p>

              <p className="text-[12px] leading-relaxed text-fg-muted">
                Toto ťa napadlo {agoLabel(ageDays)}.{" "}
                <span className="font-medium text-fg">Stále aktuálne?</span>
              </p>

              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-fg-muted">
                <SparkMeter value={idea.spark} />
                {idea.area ? (
                  <AreaDot
                    color={idea.area.color}
                    name={idea.area.name}
                    className="min-w-0 max-w-32 shrink"
                  />
                ) : null}
                <span className="shrink-0 whitespace-nowrap">
                  {touchAgeLabel(idea.staleDays)}
                </span>
              </div>

              <div className="flex min-w-0 flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() => onPromote(idea)}
                  aria-label={`Povýšiť nápad ${title} na projekt`}
                  className={DECISION_BUTTON}
                >
                  <Rocket aria-hidden="true" size={14} />
                  Povýšiť
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onKeep(idea)}
                  aria-label={`Nechať nápad ${title} ďalej zrieť`}
                  title="Osvieži hodiny zrenia — nápad sa ozve zas o nejaký čas"
                  className={DECISION_BUTTON}
                >
                  <Hourglass aria-hidden="true" size={14} />
                  Nechať zrieť
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onDiscard(idea)}
                  aria-label={`Zahodiť nápad ${title}`}
                  title="Zamietne nápad — ostane v zázname, ale prestane sa hlásiť"
                  className={cn(
                    DECISION_BUTTON,
                    "text-danger hover:border-danger/40 hover:text-danger",
                  )}
                >
                  <Ban aria-hidden="true" size={14} />
                  Zahodiť
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
