"use client";

import { useEffect, useState } from "react";
import { Moon, Sunrise } from "lucide-react";

import { hourIn } from "@/lib/dates";
import {
  RITUAL_META,
  shouldAutoOpen,
  snoozeKey,
  type RitualPeriod,
} from "@/lib/rituals";
import { Button } from "@/components/ui/button";
import { EveningShutdown } from "@/components/rituals/evening-shutdown";
import { MorningPlan } from "@/components/rituals/morning-plan";
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
  /** Obdobie denných rituálov — pre oba je to dnešok. */
  period: RitualPeriod;
  /** Podklady pre ranné plánovanie. */
  morning: {
    completed: boolean;
    initialPayload?: RitualPayload;
    overdue: TaskWithRelations[];
    candidates: TaskWithRelations[];
    plannedMin: number;
    availableMin: number;
    /** Minúty porád z kalendára. Rozpočet aj rozsudok si ich odpočítajú sami. */
    meetingMin?: number;
    withoutEstimate: number;
    postponeWarnAt: number;
    postponeBlockAt: number;
  };
  /** `settings.dayStartHour` — ranné plánovanie sa viaže naň. */
  dayStartHour: number;
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
  morning,
  dayStartHour,
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
  const [morningOpen, setMorningOpen] = useState(false);

  const key = snoozeKey("daily_shutdown", period);
  const morningKey = snoozeKey("daily_plan", period);

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

  /*
    Ranné plánovanie beží rovnako, len s vlastným prahom a vlastným kľúčom
    odloženia. Zámerne sa neotvára, keď už je po `dayEndHour` — vtedy patrí
    večer, nie ráno, a dva dialógy naraz by si liezli do cesty.
  */
  useEffect(() => {
    if (morning.completed) return;
    if (sessionStorage.getItem(morningKey) === "1") return;

    const timer = window.setTimeout(() => {
      const hour = hourIn(timeZone);
      if (hour >= dayEndHour) return;

      const should = shouldAutoOpen({
        type: "daily_plan",
        hour,
        triggerHour: dayStartHour,
        completed: morning.completed,
        snoozed: false,
        enabled: autoOpen,
        busy: isBusy(),
      });
      if (should) setMorningOpen(true);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [morning.completed, morningKey, timeZone, dayStartHour, dayEndHour, autoOpen]);

  function handleMorningOpenChange(next: boolean): void {
    setMorningOpen(next);
    if (!next && !morning.completed) sessionStorage.setItem(morningKey, "1");
  }

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
  const morningMeta = RITUAL_META.daily_plan;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => setMorningOpen(true)}
        aria-label={`${morningMeta.title} — ${morningMeta.minutes} minúty`}
      >
        <Sunrise aria-hidden="true" size={14} />
        {/*
          Pod `sm` ostáva len ikona — tri tlačidlá s plnými popiskami sa na
          375 px do hlavičky nezmestia. Názov nesie `aria-label`, takže
          čítačka ani klávesnica o nič neprichádzajú.
        */}
        <span className="hidden sm:inline">
          {morning.completed ? "Deň naplánovaný" : morningMeta.title}
        </span>
      </Button>

      <MorningPlan
        open={morningOpen}
        onOpenChange={handleMorningOpenChange}
        period={period}
        todayIso={todayIso}
        {...(morning.initialPayload ? { initialPayload: morning.initialPayload } : {})}
        overdue={morning.overdue}
        candidates={morning.candidates}
        plannedMin={morning.plannedMin}
        availableMin={morning.availableMin}
        meetingMin={morning.meetingMin ?? 0}
        withoutEstimate={morning.withoutEstimate}
        postponeWarnAt={morning.postponeWarnAt}
        postponeBlockAt={morning.postponeBlockAt}
      />

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
        aria-label={`${meta.title} — ${meta.minutes} minúty`}
      >
        <Moon aria-hidden="true" size={14} />
        <span className="hidden sm:inline">
          {completed ? "Deň zavretý" : meta.title}
        </span>
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
