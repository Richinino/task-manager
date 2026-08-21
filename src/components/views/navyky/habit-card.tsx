"use client";

import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { Archive, ArchiveRestore, Check, LoaderCircle, Trash2 } from "lucide-react";

import { areaColorValue } from "@/components/task/area-dot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { currentStreak, habitWeeks, longestStreak } from "@/lib/habits";
import { cn } from "@/lib/utils";
import { archiveHabit, deleteHabit, toggleHabitEntry } from "@/server/actions/habits";
import type { HabitWithStats } from "@/server/queries/habits";

import { HabitGrid, HabitGridCaption } from "./habit-grid";
import type { HabitAreaOption } from "./habit-types";

/* ═══════════════════════════════════════════════════════════════════════════
   KARTA NÁVYKU

   Návyk sa nikam nepreklikáva — všetko, čo sa s ním dá spraviť, je tu. Zhora
   nadol: čo to je, ako to ide, ako to šlo, a až celkom dole to, čo ho ukončí.

   Séria, plnenie týždňa aj mriežka sa počítajú ZNOVA v prehliadači, hoci ich
   `listHabits` posiela hotové. Dôvod je odškrtnutie dneška: jediné ťuknutie
   mení všetky tri naraz a keby sa prekresľovala len fajka, séria by ostala
   visieť na starom čísle až do odpovede servera — a človek by videl „splnené,
   ale séria stále 2". Čísla sa preto skladajú z jedného zdroja (`entries`
   doplnené o optimistický dnešok) tými istými čistými funkciami z
   `@/lib/habits`, aké použil server. Rozísť sa nemajú ako.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Slovenské skloňovanie: 1 týždeň · 2–4 týždne · 0 a 5+ týždňov. */
export function weekWordSk(count: number): string {
  if (count === 1) return "týždeň";
  if (count >= 2 && count <= 4) return "týždne";
  return "týždňov";
}

/** „3 týždne v rade". Nula sa nepíše ako číslo — nula série nie je séria. */
export function streakLabel(weeks: number): string {
  if (weeks === 0) return "séria ešte nebeží";
  return `${weeks} ${weekWordSk(weeks)} v rade`;
}

export interface HabitCardProps {
  habit: HabitWithStats;
  /** Všetky oblasti vrátane archivovaných — karta si len hľadá tú svoju. */
  areas: readonly HabitAreaOption[];
  /** Týždne mriežky, poskladané serverom. */
  weeks: readonly (readonly string[])[];
  /** Okno mriežky — to isté, s akým sa počítalo na serveri. */
  fromIso: string;
  toIso: string;
  todayIso: string;
  weekStartsOn: number;
  /**
   * Archivácia aj zmazanie kartu zo zoznamu odoberajú — rodič ju skryje hneď,
   * bez čakania na server.
   */
  onOptimisticRemove: (id: string) => void;
  /**
   * Chyba archivácie alebo mazania patrí rodičovi, nie karte.
   *
   * Karta sa pri týchto dvoch akciách odmontuje skôr, než odpoveď príde —
   * hláška vykreslená v nej by nemala kde vzniknúť. Chybu odškrtnutia si karta
   * naďalej rieši sama, tam nikam nemizne.
   */
  onError: (message: string) => void;
}

export function HabitCard({
  habit,
  areas,
  weeks,
  fromIso,
  toIso,
  todayIso,
  weekStartsOn,
  onOptimisticRemove,
  onError,
}: HabitCardProps) {
  const archived = habit.archivedAt !== null;
  const serverDoneToday = habit.entries.includes(todayIso);

  /*
    `useOptimistic`, nie `useState`: po dobehnutí tranzície sa hodnota sama
    vráti k tomu, čo tvrdí server. Pri zlyhaní sa teda fajka odškrtne späť bez
    jediného riadku navyše — a pri úspechu ju vystrieda revalidovaný prop, nie
    zabudnutý lokálny stav, ktorý by sa po prekreslení rozišiel s databázou.
  */
  const [doneToday, setDoneToday] = useOptimistic(
    serverDoneToday,
    (_current, next: boolean) => next,
  );

  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  /* Hláška o chybe sa nezatvára — sama zmizne, ako všade inde v aplikácii. */
  useEffect(() => {
    if (error === null) return;
    const timer = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  /* Splnené dni aj s optimistickým dneškom — jediný zdroj pre všetky čísla. */
  const entries = useMemo(() => {
    const rest = habit.entries.filter((date) => date !== todayIso);
    return doneToday ? [...rest, todayIso] : rest;
  }, [habit.entries, doneToday, todayIso]);

  const stats = useMemo(
    () =>
      habitWeeks(
        entries,
        habit.targetPerWeek,
        fromIso,
        toIso,
        weekStartsOn,
        todayIso,
      ),
    [entries, habit.targetPerWeek, fromIso, toIso, weekStartsOn, todayIso],
  );

  const doneDays = useMemo(() => new Set(entries), [entries]);

  const streak = currentStreak(stats);
  const best = longestStreak(stats);
  /* Prebiehajúci týždeň je posledný v okne, lebo `toIso` je dnešok. */
  const weekDone = stats.find((week) => week.inProgress)?.done ?? 0;
  const target = habit.targetPerWeek;
  const targetMet = weekDone >= target;

  const area = areas.find((item) => item.id === habit.areaId);

  function toggleToday(): void {
    if (isPending || archived) return;

    const next = !doneToday;
    setError(null);

    startTransition(async () => {
      // Optimistický zápis musí ísť pred prvý `await`, inak by React nemal
      // tranzíciu, ku ktorej ho priviazať, a hodnota by sa nikdy nevrátila.
      setDoneToday(next);

      try {
        const result = await toggleHabitEntry(habit.id, todayIso);
        if (!result.ok) setError(result.error);
      } catch {
        setError("Odškrtnutie sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  function toggleArchive(): void {
    setError(null);
    startTransition(async () => {
      // Karta mení pásmo (živé ↔ archív), takže z tohto zoznamu mizne hneď.
      onOptimisticRemove(habit.id);
      try {
        const result = await archiveHabit(habit.id, !archived);
        if (!result.ok) onError(result.error);
      } catch {
        onError("Zmenu sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  function remove(): void {
    setError(null);
    // Dialóg sa zatvára hneď: karta o chvíľu zmizne aj s ním a potvrdenie
    // visiace nad prázdnym miestom pôsobí ako zaseknutá appka.
    setConfirmOpen(false);
    startTransition(async () => {
      onOptimisticRemove(habit.id);
      try {
        const result = await deleteHabit(habit.id);
        if (!result.ok) onError(result.error);
      } catch {
        onError("Návyk sa nepodarilo zmazať. Skús to znova.");
      }
    });
  }

  return (
    <li className="min-w-0 rounded border border-border bg-surface p-3">
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-1 inline-block size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: areaColorValue(habit.color) }}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="min-w-0 truncate text-sm font-medium text-fg">{habit.title}</h3>

          {/*
            Séria je prvá, plnenie týždňa druhé — v tomto poradí to má aj váhu.
            Séria je to, čo človek nechce zlomiť; číslo týždňa je len účtovníctvo
            k nej. Oblasť ide na koniec a na telefóne sa oreže ako prvá.
          */}
          <p className="min-w-0 truncate text-mini leading-relaxed text-fg-subtle">
            <span className={streak > 0 ? "font-medium text-fg-muted" : undefined}>
              {streakLabel(streak)}
            </span>
            {" · "}
            <span
              className={cn("font-mono tabular-nums", targetMet && "font-medium text-success")}
            >
              {weekDone} / {target}
            </span>{" "}
            tento týždeň
            {area ? ` · ${area.name}` : ""}
            {archived ? " · archivovaný" : ""}
          </p>
        </div>

        {archived ? null : (
          <button
            type="button"
            onClick={toggleToday}
            /*
              Zámerne bez `disabled`. Tlačidlo je optimistické — fajka naskočí
              okamžite a stlmiť ho na tých pár sto milisekúnd, kým beží zápis,
              by spravilo presne to blikanie, kvôli ktorému sa optimistický
              stav zavádzal. Opakované ťuknutie zachytáva stráž v `toggleToday`.
            */
            aria-pressed={doneToday}
            aria-label={
              doneToday
                ? `Zrušiť dnešné splnenie návyku ${habit.title}`
                : `Odškrtnúť dnes návyk ${habit.title}`
            }
            title={
              doneToday
                ? "Dnes je odškrtnuté — ďalším ťuknutím sa to vráti"
                : "Odškrtnúť dnešok"
            }
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded border px-2.5 sm:min-h-9",
              "text-body font-medium transition-colors duration-100 ease-out",
              doneToday
                ? "border-success bg-surface-2 text-fg"
                : "border-border bg-surface text-fg-muted hover:border-border-strong hover:bg-surface-2 hover:text-fg",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex size-4 shrink-0 items-center justify-center rounded border",
                doneToday ? "border-success bg-success" : "border-border-strong",
              )}
            >
              {doneToday ? (
                <Check size={12} className="text-accent-fg" strokeWidth={3} />
              ) : null}
            </span>
            Dnes
          </button>
        )}
      </div>

      <HabitGrid
        weeks={weeks}
        done={doneDays}
        color={habit.color}
        todayIso={todayIso}
        weekStartsOn={weekStartsOn}
        title={habit.title}
        className="mt-3"
      />

      <div className="mt-2 flex min-w-0 items-end justify-between gap-2">
        <HabitGridCaption
          weeks={weeks}
          {...(best > streak && best > 1 ? { extra: `najdlhšie ${best} v rade` } : {})}
        />

        <div className="flex shrink-0 items-center gap-0.5">
          {isPending ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin text-fg-subtle"
            />
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleArchive}
            disabled={isPending}
            aria-label={
              archived
                ? `Vrátiť návyk ${habit.title} z archívu`
                : `Archivovať návyk ${habit.title}`
            }
            title={
              archived
                ? "Vrátiť z archívu — séria sa počíta ďalej"
                : "Archivovať — návyk sa schová, ale história aj séria ostanú"
            }
          >
            {archived ? (
              <ArchiveRestore aria-hidden="true" size={15} />
            ) : (
              <Archive aria-hidden="true" size={15} />
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setConfirmOpen(true)}
            disabled={isPending}
            aria-label={`Zmazať návyk ${habit.title}`}
            title="Zmazať — návyk aj celá jeho história zmiznú natrvalo"
            className="size-11 text-danger hover:bg-danger/10 hover:text-danger sm:size-8"
          >
            <Trash2 aria-hidden="true" size={15} />
          </Button>
        </div>
      </div>

      {error !== null ? (
        <p role="alert" className="mt-1.5 text-meta font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        {confirmOpen ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Zmazať návyk „{habit.title}"?</DialogTitle>
              <DialogDescription>
                Zmaže sa návyk{" "}
                <span className="font-medium text-fg">aj celá jeho história</span> —
                všetky odškrtnuté dni{" "}
                {best > 0
                  ? `a s nimi najdlhšia séria, ${best} ${weekWordSk(best)} v rade`
                  : "od začiatku"}
                . Späť sa to vrátiť nedá; návyk nemá kôš, z ktorého by sa dal
                vytiahnuť.
              </DialogDescription>
              <DialogDescription>
                Ak ide len o to, že návyk práve nedrží, zavri dialóg a archivuj.
                Archivovaný návyk zmizne zo zoznamu, ale odrobené týždne ostanú
                zapísané — a keď sa k nemu človek o pol roka vráti, nezačína
                od nuly.
              </DialogDescription>
            </DialogHeader>

            {/* Chyba sa sem už nevykresľuje: dialóg sa zatvára hneď pri
                potvrdení a odpoveď servera zachytáva zoznam nad kartami. */}
            <DialogFooter>
              <Button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={isPending}
              >
                Zrušiť
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={remove}
                disabled={isPending}
              >
                {isPending ? (
                  <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
                ) : (
                  <Trash2 aria-hidden="true" size={15} />
                )}
                Áno, zmazať aj históriu
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </li>
  );
}
