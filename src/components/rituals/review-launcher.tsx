"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";

import { RITUAL_META, type RitualPeriod, type RitualType } from "@/lib/rituals";
import { Button } from "@/components/ui/button";
import type { RitualPayload } from "@/components/rituals/ritual-shell";
import {
  MonthlyReview,
  type MonthlyJournalEntry,
  type PostponedTask,
  type StaleProject,
} from "@/components/rituals/monthly-review";
import { WeeklyReview } from "@/components/rituals/weekly-review";
import type { IncubatorItem } from "@/components/views/napady/incubator-strip";
import type { ProjectWithCounts } from "@/server/queries/structure";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   SPÚŠŤAČE REVÍZIÍ

   Týždenná a mesačná revízia sa NEOTVÁRAJÚ samy — `ritualTriggerHour` im vracia
   `null`. Pätnásť až tridsať minút práce nemá nikoho prepadnúť, na tie sa treba
   rozhodnúť vedome. Preto tlačidlo, a nie automatika.

   Býva na obrazovke, ktorej obdobie revízia pokrýva: týždenná na „Týždeň",
   mesačná na „Mesiac". Vlastná obrazovka rituálov by bola miesto navyše, kam
   sa nikto nechodí pozerať.

   Každá revízia má vlastný spúšťač so vlastnými propmi. Jeden všeobecný
   s render-propom by bol kratší, ale funkcia sa zo serverového komponentu do
   klientskeho odovzdať nedá — React ju nevie serializovať a stránka spadne
   až za behu.
   ═══════════════════════════════════════════════════════════════════════════ */

function ReviewButton({
  type,
  completed,
  onClick,
}: {
  type: Extract<RitualType, "weekly" | "monthly">;
  completed: boolean;
  onClick: () => void;
}) {
  const meta = RITUAL_META[type];
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="gap-1.5"
      onClick={onClick}
      aria-label={`${meta.title} — ${meta.minutes} minút`}
    >
      <ClipboardCheck aria-hidden="true" size={14} />
      {/*
        Na 375 px je vedľa dátumu miesto len na jedno slovo. Celý názov ostáva
        v `aria-label`, takže čítačka o nič neprichádza.
      */}
      <span className="hidden sm:inline">{meta.title}</span>
      <span className="sm:hidden">Revízia</span>
      {completed ? (
        <span className="text-meta font-normal text-fg-subtle">hotová</span>
      ) : null}
    </Button>
  );
}

export interface WeeklyReviewLauncherProps {
  period: RitualPeriod;
  /** Je revízia za toto obdobie už uzavretá? Tlačidlo podľa toho píše „hotová". */
  completed: boolean;
  initialPayload?: RitualPayload;
  todayIso: string;
  inbox: TaskWithRelations[];
  waiting: TaskWithRelations[];
  someday: TaskWithRelations[];
  incubatorIdeas: IncubatorItem[];
  projects: ProjectWithCounts[];
  /**
   * Dokončené úlohy týždňa pre win report. Volajú sa `completedTasks`, hoci
   * revízia ich vnútri pozná ako `completed` — v tomto rozhraní už `completed`
   * znamená uzavretú revíziu a dve veci pod jedným menom by sa raz pomýlili.
   */
  completedTasks: TaskWithRelations[];
}

export function WeeklyReviewLauncher({
  period,
  completed,
  initialPayload,
  completedTasks,
  ...data
}: WeeklyReviewLauncherProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ReviewButton type="weekly" completed={completed} onClick={() => setOpen(true)} />
      <WeeklyReview
        open={open}
        onOpenChange={setOpen}
        period={period}
        {...(initialPayload ? { initialPayload } : {})}
        completed={completedTasks}
        {...data}
      />
    </>
  );
}

export interface MonthlyReviewLauncherProps {
  period: RitualPeriod;
  completed: boolean;
  initialPayload?: RitualPayload;
  todayIso: string;
  mostPostponed: PostponedTask[];
  staleProjects: StaleProject[];
  journalEntries: MonthlyJournalEntry[];
  completedCount: number;
  postponeDangerAt?: number;
}

export function MonthlyReviewLauncher({
  period,
  completed,
  initialPayload,
  ...data
}: MonthlyReviewLauncherProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ReviewButton type="monthly" completed={completed} onClick={() => setOpen(true)} />
      <MonthlyReview
        open={open}
        onOpenChange={setOpen}
        period={period}
        {...(initialPayload ? { initialPayload } : {})}
        {...data}
      />
    </>
  );
}
