"use client";

import { useState, useTransition } from "react";

import type { Area, Project } from "@/db/schema";
import { formatRelativeSk, parseIsoDate, toIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { AreaDot } from "@/components/task/area-dot";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTask } from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

import {
  TRIAGE_ACTIONS,
  TRIAGE_ORDER,
  type TriageAction,
} from "@/components/views/inbox/triage-actions";

/**
 * Triedička — jedna vec naraz, veľká.
 *
 * Toto je celý rozdiel oproti zoznamu, ktorým inbox býval: nevidíš sedem
 * riadkov naraz a nerozhoduješ sa, ktorý začať. Vidíš jednu vec, pod ňou
 * šesť priehradiek na jedno stlačenie, a vpravo koľko toho ešte je.
 *
 * Tvar je z návrhu („Inbox — triedička"): štítok, veľký názov, kedy to
 * vzniklo, mriežka priehradiek a pod ňou doplnenie údajov. Na telefóne sú
 * z priehradiek 64 px tlačidlá v dvoch stĺpcoch — tam sa triedi palcom,
 * nie klávesnicou.
 */
export interface TriagePanelProps {
  task: TaskWithRelations;
  /** Koľkátu vec triediš (od 1). */
  position: number;
  total: number;
  areas: readonly Area[];
  projects: readonly Project[];
  onTriage: (action: TriageAction) => void;
  onError: (message: string) => void;
  /** Dnešok z pásma používateľa — aby sa server a klient nerozišli. */
  todayIso: string;
}

/** Hodnota, ktorá v `<Select>` znamená „nič". Prázdny reťazec Radix nedovolí. */
const NONE = "__none__";

/** Pilulka s údajom — v návrhu 32 px vysoká s polomerom 16. */
const pilulka = [
  "flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-border px-3",
  "text-sm text-fg-muted sm:h-8",
].join(" ");

export function TriagePanel({
  task,
  position,
  total,
  areas,
  projects,
  onTriage,
  onError,
  todayIso,
}: TriagePanelProps) {
  const [, startTransition] = useTransition();
  const [projectValue, setProjectValue] = useState(task.projectId ?? NONE);
  const [areaValue, setAreaValue] = useState(task.areaId ?? NONE);

  const now = parseIsoDate(todayIso);
  const zachytene = formatRelativeSk(toIsoDate(new Date(task.createdAt)), now);

  function uloz(
    patch: { projectId?: string | null; areaId?: string | null },
    vrat: () => void,
  ): void {
    startTransition(async () => {
      try {
        const result = await updateTask(task.id, patch);
        if (!result.ok) {
          vrat();
          onError(result.error);
        }
      } catch {
        vrat();
        onError("Zmenu sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col px-4 py-5 sm:px-10 sm:py-9">
      <p className="label mb-3.5 text-fg-subtle">
        Triediš {position} z {total}
      </p>

      {/*
        Názov je najväčšia vec na obrazovke zámerne — je to jediné, o čom sa
        práve rozhoduješ. `text-wrap: pretty` drží posledný riadok slušný.
      */}
      <h2 className="mb-2.5 text-2xl font-semibold leading-tight tracking-tight text-pretty sm:text-3xl">
        {task.title}
      </h2>

      <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-meta text-fg-muted sm:mb-7">
        <span>zachytené {zachytene}</span>
        {task.area ? (
          <>
            <span aria-hidden="true">·</span>
            <AreaDot
              color={task.area.color}
              name={task.area.name}
              className="font-sans"
            />
          </>
        ) : null}
      </p>

      <p className="label mb-2.5 text-fg-subtle">Kam to patrí</p>
      <div className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-3">
        {TRIAGE_ORDER.map((action, index) => {
          const meta = TRIAGE_ACTIONS[action];
          const prva = index === 0;
          return (
            <button
              key={action}
              type="button"
              onClick={() => onTriage(action)}
              title={meta.hint}
              aria-label={meta.hint}
              className={cn(
                "flex h-16 cursor-pointer items-center gap-2.5 rounded-md border px-3.5 text-left sm:h-14",
                "transition-colors duration-100 ease-out",
                prva
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-fg hover:border-border-strong hover:bg-surface-2",
              )}
            >
              {/*
                Na odznaku je skutočná klávesa, nie poradové číslo — inak by
                si človek zapamätal „štvorka" a stlačil niečo iné.
              */}
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-[22px] shrink-0 items-center justify-center rounded-sm font-mono text-mini",
                  prva ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-muted",
                )}
              >
                {meta.shortcut === "Backspace" ? "⌫" : meta.shortcut}
              </span>
              <span className={cn("min-w-0 truncate text-sm", prva && "font-semibold")}>
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="label mb-2.5 text-fg-subtle">Rýchle doplnenie</p>
      <div className="flex flex-wrap gap-1.5">
        <Select
          value={areaValue}
          onValueChange={(value) => {
            const predtym = areaValue;
            setAreaValue(value);
            uloz({ areaId: value === NONE ? null : value }, () => setAreaValue(predtym));
          }}
        >
          <SelectTrigger aria-label="Oblasť úlohy" className={cn(pilulka, "w-auto")}>
            <SelectValue placeholder="Oblasť" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Bez oblasti</SelectItem>
            {areas.map((area) => (
              <SelectItem key={area.id} value={area.id}>
                {area.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={projectValue}
          onValueChange={(value) => {
            const predtym = projectValue;
            setProjectValue(value);
            uloz(
              { projectId: value === NONE ? null : value },
              () => setProjectValue(predtym),
            );
          }}
        >
          <SelectTrigger aria-label="Projekt úlohy" className={cn(pilulka, "w-auto")}>
            <SelectValue placeholder="Projekt" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Bez projektu</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {task.context ? (
          <span className={cn(pilulka, "font-mono")}>
            {task.context.startsWith("@") ? task.context : `@${task.context}`}
          </span>
        ) : null}
      </div>

      {/* Skratky ostávajú dole, kde neprekážajú rozhodovaniu. */}
      <p
        aria-hidden="true"
        className="mt-auto hidden flex-wrap items-center gap-3.5 pt-6 font-mono text-mini text-fg-subtle sm:flex"
      >
        <span>
          {TRIAGE_ORDER.map((a) =>
            TRIAGE_ACTIONS[a].shortcut === "Backspace" ? "⌫" : TRIAGE_ACTIONS[a].shortcut,
          ).join(" ")}{" "}
          zaradiť
        </span>
        <span>j k preskočiť</span>
        <span>Ctrl Z vrátiť</span>
      </p>
    </div>
  );
}
