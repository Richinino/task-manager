"use client";

import { useEffect, useState } from "react";
import { Moon } from "lucide-react";

import { hourIn } from "@/lib/dates";
import {
  RITUAL_META,
  shouldAutoOpen,
  snoozeKey,
  type RitualPeriod,
} from "@/lib/rituals";
import { Button } from "@/components/ui/button";
import { EveningShutdown } from "@/components/rituals/evening-shutdown";
import type { RitualPayload } from "@/components/rituals/ritual-shell";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   HOSTITEĽ RITUÁLOV

   Žije IBA na obrazovke „Dnes". Rieši, či sa rituál otvorí sám, a nesie
   tlačidlo na ručné spustenie.

   Otváranie bez vyžiadania je najrýchlejší spôsob, ako človeka odnaučiť appku
   otvárať. Podmienky sú preto prísne a platia všetky naraz — rozhoduje o nich
   `shouldAutoOpen`, ktorá je čistá a otestovaná. Tu ostáva len to, čo sa bez
   prehliadača zistiť nedá: aktuálna hodina, otvorený dialóg a odloženie.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Je otvorený iný dialóg?
 *
 * Radix necháva na otvorenom dialógu `data-state="open"`, takže jeden dopyt
 * pokryje rýchle zachytenie, detail úlohy aj blok odkladov naraz. Prevliekať
 * stav cez tri providery by bolo krehkejšie a zabudlo by sa na štvrtý.
 */
function isBusy(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

export interface RitualHostProps {
  period: RitualPeriod;
  /** Je večerný shutdown za toto obdobie hotový? */
  completed: boolean;
  /** Rozrobené odpovede, ak sa rituál už začal. */
  initialPayload?: RitualPayload;
  initialJournal?: { body: string | null; mood: number | null };
  /** Dnešné úlohy. */
  tasks: TaskWithRelations[];
  todayIso: string;
  timeZone: string;
  /** `settings.dayEndHour` — večerný shutdown sa viaže naň. */
  dayEndHour: number;
  /** `settings.ritualAutoOpen` */
  autoOpen: boolean;
}

export function RitualHost({
  period,
  completed,
  initialPayload,
  initialJournal,
  tasks,
  todayIso,
  timeZone,
  dayEndHour,
  autoOpen,
}: RitualHostProps) {
  const [open, setOpen] = useState(false);

  const key = snoozeKey("daily_shutdown", period);

  /*
    Rozhodnutie o automatickom otvorení beží až po pripojení, nie pri
    vykreslení: potrebuje hodinu aj `sessionStorage`, ktoré na serveri nie sú,
    a spustiť ho počas hydratácie by dalo iný výsledok na serveri než v klientovi.
  */
  useEffect(() => {
    if (completed) return;

    // Odloženie žije iba v `sessionStorage` — vlastný stav by tú istú vec
    // držal dvakrát a mohol by sa s ňou rozísť.
    if (sessionStorage.getItem(key) === "1") return;

    // Malé oneskorenie necháva dobehnúť prípadný dialóg, ktorý sa otvára
    // spolu so stránkou — inak by `isBusy` odpovedalo predčasne.
    const timer = window.setTimeout(() => {
      const should = shouldAutoOpen({
        type: "daily_shutdown",
        hour: hourIn(timeZone),
        triggerHour: dayEndHour,
        completed,
        snoozed: false,
        enabled: autoOpen,
        busy: isBusy(),
      });
      if (should) setOpen(true);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [completed, key, timeZone, dayEndHour, autoOpen]);

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (!next && !completed) {
      // Zavretie bez dokončenia = „Nechať tak" do zajtra. Do databázy to
      // nepatrí: je to rozhodnutie o jednom dni, nie údaj, ktorý má prežiť.
      // Riadok v `reviews` bez `completedAt` by sa navyše nedal odlíšiť od
      // rozrobeného rituálu.
      sessionStorage.setItem(key, "1");
    }
  }

  const meta = RITUAL_META.daily_shutdown;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
        aria-label={`${meta.title} — ${meta.minutes} minúty`}
      >
        <Moon aria-hidden="true" size={14} />
        {completed ? "Deň zavretý" : meta.title}
      </Button>

      <EveningShutdown
        open={open}
        onOpenChange={handleOpenChange}
        period={period}
        tasks={tasks}
        todayIso={todayIso}
        {...(initialPayload ? { initialPayload } : {})}
        {...(initialJournal ? { initialJournal } : {})}
      />
    </>
  );
}
