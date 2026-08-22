import { Repeat, Sprout } from "lucide-react";
import Link from "next/link";

import { AreaDot } from "@/components/task/area-dot";
import { Card } from "@/components/ui/card";
import { formatDayMonthSk } from "@/lib/dates";
import { describeRecurrence, nextOccurrence, parseRecurrence } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@/server/queries/tasks";

/**
 * Prehľad opakovaných úloh.
 *
 * Doteraz sa pravidlo dalo zistiť len otvorením konkrétnej úlohy, takže
 * odpoveď na otázku „čo sa mi vlastne opakuje?" neexistovala. Práve tá je
 * pritom pri revízii dôležitá: opakovanie sa nastavuje raz a potom o ňom
 * človek roky nevie, hoci mu ticho zapĺňa každý týždeň.
 */
export interface RecurringListProps {
  tasks: readonly TaskWithRelations[];
  /** Dnešok v pásme používateľa — ďalší výskyt sa počíta od neho. */
  todayIso: string;
}

export function RecurringList({ tasks, todayIso }: RecurringListProps) {
  if (tasks.length === 0) {
    return (
      <Card className="flex flex-col gap-2">
        <p className="text-sm font-medium text-fg">Nič sa neopakuje.</p>
        <p className="text-body leading-relaxed text-fg-muted">
          Opakovanie nastavíš v detaile úlohy v sekcii „Kedy“. Hodí sa na veci
          s pevným rytmom — faktúru, zálohu, týždenné plánovanie.
        </p>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => {
        const recurrence = parseRecurrence(task.recurrenceRule);
        // Bez pravidla by sa sem úloha nedostala; poistka je tu pre prípad
        // poškodeného reťazca v databáze, aby nespadol celý zoznam.
        if (recurrence === null) return null;

        const next = nextOccurrence(recurrence, todayIso);

        return (
          <li key={task.id}>
            <Card flush className="flex items-center gap-3 px-3 py-2.5">
              <Repeat
                aria-hidden="true"
                size={15}
                className="shrink-0 text-fg-subtle"
              />

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm text-fg">{task.title}</span>
                <span className="flex min-w-0 items-center gap-2 text-meta text-fg-muted">
                  <span className="truncate">{describeRecurrence(recurrence)}</span>
                  {task.area ? (
                    <AreaDot
                      color={task.area.color}
                      name={task.area.name}
                      size="sm"
                      className="hidden min-w-0 shrink sm:flex"
                    />
                  ) : null}
                </span>
              </div>

              {/*
                Ďalší výskyt je to jediné číslo, kvôli ktorému sem človek
                príde — preto vpravo, kde ho oko hľadá, a v mono, aby sa
                dátumy pod sebou zarovnali.
              */}
              <span
                className={cn(
                  "shrink-0 text-right font-mono text-mini tabular-nums",
                  next === null ? "text-fg-subtle" : "text-fg-muted",
                )}
              >
                {next === null ? "—" : formatDayMonthSk(next)}
              </span>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Vysvetlenie rozdielu oproti návykom.
 *
 * Bez neho sú to dve obrazovky, ktoré vyzerajú ako to isté. Rozdiel je
 * praktický, nie filozofický: opakovaná úloha zaberie miesto v dni a ráta sa
 * do rozpočtu času, návyk nie.
 */
export function RecurringVsHabits() {
  return (
    <Card className="flex items-start gap-3">
      <Sprout aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-fg-subtle" />
      <p className="text-body leading-relaxed text-fg-muted">
        Nie je to to isté ako{" "}
        <Link href="/navyky" className="font-medium text-accent hover:underline">
          návyky
        </Link>
        . Opakovaná úloha sa objaví v dni, zaberie v ňom miesto a ráta sa do
        rozpočtu času — musíš ju spraviť. Návyk sa len odškrtáva a jedno
        vynechanie nič nepokazí.
      </p>
    </Card>
  );
}
