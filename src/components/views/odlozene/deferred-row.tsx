"use client";

import { CheckCheck, Sun, Sunrise, Trash2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TaskItem } from "@/components/task/task-item";
import { runTriage } from "@/components/views/inbox/triage-row";
import { setWaiting } from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   AKCIE ODKLADÍSK

   „Niekedy" aj „Čaká sa na" sú tá istá vec z dvoch strán: úloha leží bokom
   a potrebuje jedno rozhodnutie, aby sa vrátila do hry. Zoznam akcií je preto
   spoločný a obrazovka si z neho vyberie tie svoje.
   ═══════════════════════════════════════════════════════════════════════════ */

export type DeferredAction = "today" | "tomorrow" | "drop" | "unwait";

export interface DeferredActionMeta {
  /** Popis na tlačidle od `sm:`. */
  label: string;
  /**
   * Skrátený popis pre telefón. Tri tlačidlá sa na 375 px delia o mriežku
   * 3×1, kde na stĺpec vyjde ~110 px — dlhší text by riadok pretiahol von
   * z obrazovky. Plné znenie nesie `hint` v `aria-label`.
   */
  shortLabel: string;
  /** Celá veta do tooltipu a pre čítačky. */
  hint: string;
  Icon: LucideIcon;
  tone: "default" | "success" | "danger";
}

export const DEFERRED_ACTIONS: Record<DeferredAction, DeferredActionMeta> = {
  today: {
    label: "Na dnes",
    shortLabel: "Dnes",
    hint: "Naplánovať na dnes",
    Icon: Sun,
    tone: "default",
  },
  tomorrow: {
    label: "Na zajtra",
    shortLabel: "Zajtra",
    hint: "Naplánovať na zajtra",
    Icon: Sunrise,
    tone: "default",
  },
  drop: {
    label: "Zahodiť",
    shortLabel: "Zahodiť",
    hint: "Zahodiť úlohu",
    Icon: Trash2,
    tone: "danger",
  },
  unwait: {
    label: "Už nečakám",
    shortLabel: "Už nečakám",
    hint: "Už nečakám — vrátiť úlohu medzi aktívne",
    Icon: CheckCheck,
    tone: "success",
  },
};

/** Rovnaký tvar ako `ActionResult<void>`, len bez väzby na `"use server"` modul. */
export type DeferredResult = { ok: true } | { ok: false; error: string };

/**
 * Vykoná rozhodnutie a vráti výsledok.
 *
 * Naplánovanie ani zahodenie si tu nepíšeme znova: `runTriage` z inboxu je
 * jediné miesto, kde žije pravidlo „naplánovanie = presun dňa **a** dorovnanie
 * stavu na `todo`". Bez toho dorovnania úloha po obnove dát spadne späť do
 * inboxu — a presne na tejto pasci sa už raz úlohy stratili. Druhá kópia toho
 * pravidla by sa skôr či neskôr s originálom rozišla.
 *
 * Horizont sa dorovná sám: `rescheduleTask` pri konkrétnom dni prepíše
 * `horizon` podľa dátumu, takže úloha z „niekedy" vypadne bez ďalšieho zásahu.
 *
 * `setWaiting(id, false)` naopak vráti úlohu do stavu, v ktorom je viditeľná
 * (s dňom `todo`, bez neho `inbox`) — to rieši serverová akcia sama.
 */
export async function runDeferred(
  action: DeferredAction,
  taskId: string,
  todayIso: string,
): Promise<DeferredResult> {
  switch (action) {
    case "today":
      return runTriage("today", taskId, todayIso);
    case "tomorrow":
      return runTriage("tomorrow", taskId, todayIso);
    case "drop":
      return runTriage("drop", taskId, todayIso);
    case "unwait":
      return setWaiting(taskId, false);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   RIADOK
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Mriežka tlačidiel pod `sm:`. Triedy musia byť v zdroji doslova — Tailwind
 * číta triedy staticky a `grid-cols-${n}` by nevygeneroval nič.
 */
const GRID_BY_COUNT: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

export interface DeferredRowProps {
  task: TaskWithRelations;
  /** Ktoré rozhodnutia obrazovka pri tejto úlohe ponúka. */
  actions: readonly DeferredAction[];
  onAction: (action: DeferredAction) => void;
  /** Dnešok z pásma používateľa — aby sa server a klient nerozišli pri hydratácii. */
  todayIso: string;
  /** Od koľkých odkladov sa odznak zobrazí — `settings.postponeWarnAt`. */
  postponeWarnAt: number;
  /** Od koľkých odkladov je odznak červený — `settings.postponeBlockAt`. */
  postponeBlockAt: number;
}

/**
 * Jedna odložená úloha aj s rýchlou cestou späť do hry.
 *
 * Zobrazenie úlohy je zdieľaný `TaskItem` — vlastnú kópiu si tu nikto nerobí.
 * Tlačidlá pod ním sú len skratka: to isté (a viac) vie aj menu v riadku,
 * ale na odkladisku má byť návrat na jedno ťuknutie, nie na dve.
 */
export function DeferredRow({
  task,
  actions,
  onAction,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: DeferredRowProps) {
  const grid = GRID_BY_COUNT[actions.length] ?? "grid-cols-3";

  return (
    <li
      className={cn(
        "rounded border border-border bg-surface transition-colors duration-100 ease-out",
        "hover:border-border-strong",
      )}
    >
      <div className="px-1 pt-1">
        <TaskItem
          task={task}
          density="full"
          showDate
          showFrog={false}
          todayIso={todayIso}
          postponeWarnAt={postponeWarnAt}
          postponeBlockAt={postponeBlockAt}
        />
      </div>

      {/*
        Pod `sm:` sú tlačidlá v mriežke cez celú šírku a majú 44 px na výšku,
        takže sa dajú trafiť palcom. Od `sm:` má mriežka `display: contents`,
        zmizne z rozloženia a tlačidlá sa stanú priamymi položkami riadku —
        zalamovanie na tablete a počítači tak ostáva rovnaké ako inde.
      */}
      <div className="flex flex-col gap-1.5 border-t border-border px-2 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:py-1.5">
        <div className={cn("grid gap-1.5 sm:contents", grid)}>
          {actions.map((action) => {
            const meta = DEFERRED_ACTIONS[action];
            const Icon = meta.Icon;

            return (
              <Button
                key={action}
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onAction(action)}
                aria-label={`${meta.hint}: ${task.title}`}
                title={meta.hint}
                className={cn(
                  "h-11 w-full min-w-0 px-1 sm:h-7 sm:w-auto sm:px-2",
                  meta.tone === "danger" &&
                    "text-danger hover:bg-danger/10 hover:text-danger",
                  meta.tone === "success" &&
                    "text-success hover:bg-success/10 hover:text-success",
                )}
              >
                <Icon size={14} aria-hidden="true" />
                <span className="truncate sm:hidden">{meta.shortLabel}</span>
                <span className="hidden sm:inline">{meta.label}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </li>
  );
}
