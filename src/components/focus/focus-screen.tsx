"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, CircleHelp, ExternalLink, Pause, Plus } from "lucide-react";

import { AreaDot } from "@/components/task/area-dot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { isTextInputElement } from "@/lib/keyboard";
import { EXTEND_FOCUS_MIN } from "@/lib/focus";
import { TIME_UP_PROMPT, remainingLabel, spentLine } from "@/lib/focus-label";
import { cn } from "@/lib/utils";
import { addSubtask, toggleTaskDone } from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { loadFocusExtras, type FocusStep } from "./focus-data";
import { useFocus } from "./focus-context";

/* ═══════════════════════════════════════════════════════════════════════════
   OBRAZOVKA FOKUSU

   Jedna úloha, jeden ďalší krok, jedno číslo — koľko minút ešte zostáva.
   Na telefóne celá obrazovka, na počítači stredový panel. Zatvorenie
   (Esc, šípka dole) fokus nekončí, len ho zmenší do lišty.

   Zámerne bez sekúnd, bez série dní a bez pochvál: fokus má pomôcť začať
   a vedieť, kedy prestať, nie zbierať body (PLAN.md §6.7).
   ═══════════════════════════════════════════════════════════════════════════ */

/** „+15 min" sa ponúka, až keď sa zíde — nie od začiatku. */
const EXTEND_VISIBLE_AT_MIN = 5;

export interface FocusScreenProps {
  open: boolean;
  /** Otvorí detail úlohy; `null`, keď provider detailu nie je. */
  onOpenDetail: ((task: TaskWithRelations) => void) | null;
}

export function FocusScreen({ open, onOpenDetail }: FocusScreenProps) {
  const focus = useFocus();
  const active = focus?.active ?? null;
  if (focus === null || active === null) return null;

  const { task } = active;
  const remaining = focus.remaining ?? 0;
  const over = focus.isOver;
  const showExtend = over || remaining <= EXTEND_VISIBLE_AT_MIN;

  /*
    Jednopísmenové skratky platia len mimo písania. Globálne skratky vnútri
    dialógu mlčia (viď `lib/keyboard.ts`), takže sa tu nemajú s čím biť —
    preto sa pýtame len na textové pole, nie na „prekrytie" (to je tu vždy).
  */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof Element && isTextInputElement(event.target)) return;
    if (event.key === "h") {
      event.preventDefault();
      void focus?.finish(true);
    } else if (event.key === "p") {
      event.preventDefault();
      void focus?.pause();
    } else if (event.key === "+" && showExtend) {
      event.preventDefault();
      void focus?.extend();
    } else if (event.key === "z") {
      event.preventDefault();
      focus?.openStuck();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && focus.closeScreen()}>
      <DialogContent
        showClose={false}
        onKeyDown={onKeyDown}
        className={cn(
          "flex flex-col gap-0 p-0",
          // Telefón: celá obrazovka. Počítač: panel uprostred.
          "max-md:inset-0 max-md:m-0 max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:max-w-none max-md:rounded-none max-md:border-0",
          "md:max-w-xl",
        )}
      >
        <DialogDescription className="sr-only">
          Fokus na jednej úlohe. Escape ho zmenší do lišty, fokus pritom beží ďalej.
        </DialogDescription>

        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
          <DialogTitle className="label min-w-0 flex-1 truncate text-fg-subtle">Fokus</DialogTitle>
          <span
            aria-hidden="true"
            className="hidden shrink-0 items-center gap-1 font-mono text-mini text-fg-subtle md:inline-flex"
          >
            <Kbd>Esc</Kbd> minimalizovať
          </span>
          <DialogClose
            aria-label="Minimalizovať fokus do lišty"
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center rounded md:size-8",
              "text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg",
            )}
          >
            <ChevronDown aria-hidden="true" className="size-5" />
          </DialogClose>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 md:px-6">
          <div className="flex flex-wrap items-center gap-2 text-meta text-fg-muted">
            {task.area ? (
              <AreaDot color={task.area.color} name={task.area.name} className="font-sans" />
            ) : null}
            {task.project ? (
              <span className="rounded-full bg-surface-2 px-2 py-0.5">{task.project.name}</span>
            ) : null}
            {task.subject ? (
              <span className="rounded-full bg-surface-2 px-2 py-0.5">{task.subject.code}</span>
            ) : null}
          </div>

          <h2 className="font-display text-hero leading-[1.1] tracking-tight [overflow-wrap:anywhere] md:text-3xl">
            {task.title}
          </h2>

          <FocusBody key={task.id} task={task} />

          <div className="mt-auto flex flex-col gap-3 pt-2">
            {over ? (
              <p
                role="status"
                className="rounded border border-warn bg-surface-2 px-3 py-2 text-body leading-relaxed text-fg"
              >
                {TIME_UP_PROMPT}
              </p>
            ) : null}

            <div>
              <p
                className={cn(
                  "font-display text-3xl leading-none tracking-tight md:text-4xl",
                  over ? "text-warn" : "text-fg",
                )}
              >
                {remainingLabel(remaining)}
              </p>
              <div
                aria-hidden="true"
                className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-2"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500 ease-out",
                    over ? "bg-warn" : "bg-accent",
                  )}
                  style={{ width: `${Math.round(focus.progress * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 font-mono text-meta tabular-nums text-fg-muted">
                {spentLine(focus.spentMin, task.estimateMin)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6 md:pb-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="md"
              className="min-w-0 flex-[2] basis-32"
              disabled={focus.busy}
              onClick={() => void focus.finish(true)}
            >
              <Check aria-hidden="true" size={16} />
              Hotovo
              <span aria-hidden="true" className="hidden md:inline">
                <Kbd>H</Kbd>
              </span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              className="min-w-0 flex-1 basis-24"
              disabled={focus.busy}
              onClick={() => void focus.pause()}
            >
              <Pause aria-hidden="true" size={16} />
              Pauza
              <span aria-hidden="true" className="hidden md:inline">
                <Kbd>P</Kbd>
              </span>
            </Button>
            {showExtend ? (
              <Button
                type="button"
                variant={over ? "primary" : "secondary"}
                size="md"
                className="min-w-0 flex-1 basis-24"
                disabled={focus.busy}
                onClick={() => void focus.extend()}
              >
                <Plus aria-hidden="true" size={16} />+{EXTEND_FOCUS_MIN} min
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              disabled={focus.busy}
              onClick={focus.openStuck}
            >
              <CircleHelp aria-hidden="true" size={16} />
              Zasekol som sa
              <span aria-hidden="true" className="hidden md:inline">
                <Kbd>Z</Kbd>
              </span>
            </Button>
            {onOpenDetail ? (
              <Button type="button" variant="ghost" size="md" onClick={() => onOpenDetail(task)}>
                <ExternalLink aria-hidden="true" size={16} />
                Detail úlohy
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TELO: hotovo znamená, poznámka, ďalší krok
   ═══════════════════════════════════════════════════════════════════════════ */

function FocusBody({ task }: { task: TaskWithRelations }) {
  const [steps, setSteps] = useState<FocusStep[] | null>(null);
  const [definition, setDefinition] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const tempRef = useRef(0);

  const projectId = task.project?.id ?? null;
  useEffect(() => {
    let cancelled = false;
    void loadFocusExtras(task.id, projectId)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          setSteps([]);
          return;
        }
        setSteps(result.data.steps);
        setDefinition(result.data.definitionOfDone);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Kroky úlohy sa nepodarilo načítať.");
        setSteps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [task.id, projectId]);

  const next = steps?.find((step) => !step.done) ?? null;
  const remainingSteps = steps ? steps.filter((step) => !step.done).length - (next ? 1 : 0) : 0;
  const allDone = steps !== null && steps.length > 0 && next === null;
  const note = task.note?.trim() ?? "";

  function complete(step: FocusStep): void {
    const before = steps;
    setSteps((current) =>
      current ? current.map((s) => (s.id === step.id ? { ...s, done: true } : s)) : current,
    );
    setError(null);
    void toggleTaskDone(step.id)
      .then((result) => {
        if (result.ok) return;
        setSteps(before);
        setError(result.error);
      })
      .catch(() => {
        setSteps(before);
        setError("Krok sa nepodarilo odškrtnúť. Skús to znova.");
      });
  }

  function add(): void {
    const title = draft.trim();
    if (title === "") return;
    const tempId = `tmp:${(tempRef.current += 1)}`;
    const before = steps;
    setDraft("");
    setError(null);
    setSteps((current) => [...(current ?? []), { id: tempId, title, done: false }]);
    void addSubtask(task.id, title)
      .then((result) => {
        if (!result.ok) {
          setSteps(before);
          setDraft(title);
          setError(result.error);
          return;
        }
        setSteps((current) =>
          current ? current.map((s) => (s.id === tempId ? { ...s, id: result.data.id } : s)) : current,
        );
      })
      .catch(() => {
        setSteps(before);
        setDraft(title);
        setError("Krok sa nepodarilo pridať. Skús to znova.");
      });
  }

  return (
    <div className="flex flex-col gap-5">
      {definition !== null ? (
        <div className="rounded bg-surface-2 px-3 py-2.5 text-body leading-relaxed text-fg-muted">
          <b className="label block text-fg-subtle">Hotovo znamená</b>
          „{definition}“
        </div>
      ) : null}

      {note !== "" ? (
        <p className="line-clamp-4 whitespace-pre-wrap text-body leading-relaxed text-fg-muted [overflow-wrap:anywhere]">
          {note}
        </p>
      ) : null}

      <section aria-label="Ďalší krok" className="flex flex-col gap-2">
        <h3 className="label text-fg-subtle">Ďalší krok</h3>

        {steps === null ? (
          <p className="text-body text-fg-subtle">Načítavam kroky…</p>
        ) : next !== null ? (
          <div className="flex items-start gap-3 rounded border border-border bg-surface px-3 py-2.5">
            {/* Dotykový cieľ 44 px nesie tlačidlo okolo malého políčka. */}
            <button
              type="button"
              role="checkbox"
              aria-checked="false"
              aria-label={`Hotovo: ${next.title}`}
              disabled={next.id.startsWith("tmp:")}
              onClick={() => complete(next)}
              className="-m-2.5 inline-flex size-11 shrink-0 items-center justify-center disabled:opacity-45"
            >
              <span
                aria-hidden="true"
                className="size-5 rounded-sm border border-border-strong bg-surface transition-colors duration-100 hover:border-accent"
              />
            </button>
            <span className="min-w-0 flex-1 pt-px text-row font-medium [overflow-wrap:anywhere]">
              {next.title}
            </span>
            {remainingSteps > 0 ? (
              <span className="shrink-0 font-mono text-meta text-fg-subtle">
                +{remainingSteps}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-body leading-relaxed text-fg-muted">
            {allDone
              ? "Všetky kroky sú hotové. Ak je aj úloha, daj Hotovo."
              : "Úloha nemá kroky. Napíš prvý — stačí malý."}
          </p>
        )}

        {steps !== null ? (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Pridať krok"
              aria-label="Pridať krok"
              maxLength={200}
            />
            <Button type="submit" variant="secondary" size="icon" aria-label="Pridať krok">
              <Plus aria-hidden="true" size={16} />
            </Button>
          </form>
        ) : null}

        {error !== null ? (
          <p role="alert" className="text-body text-danger">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
