"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Undo2 } from "lucide-react";

import type { Area, Project } from "@/db/schema";
import { isTypingTarget, registerShortcuts } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { TaskDetail } from "@/components/task/task-detail";
import { restoreTask } from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   KONTEXT

   Panel s detailom žije na jednom mieste — v layoute prihlásenej časti —
   a otvára ho ktorýkoľvek komponent pod providerom. Otvára sa CELÝM objektom
   úlohy, nie identifikátorom: volajúci ho vždy má a ušetrí to jeden dotaz.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface TaskDetailContextValue {
  open: (task: TaskWithRelations) => void;
  close: () => void;
}

const TaskDetailContext = createContext<TaskDetailContextValue | null>(null);

/**
 * Vráti `null` mimo providera — volajúci si musí poradiť aj bez neho.
 *
 * Zámerne to nie je výnimka: `TaskItem` a spol. sa používajú aj v miestach,
 * ktoré panel nemajú (napr. náhľady), a spadnúť tam kvôli detailu by bolo
 * neúmerné. Kto panel nemá, jednoducho neponúkne otvorenie.
 */
export function useTaskDetail(): TaskDetailContextValue | null {
  return useContext(TaskDetailContext);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROVIDER
   ═══════════════════════════════════════════════════════════════════════════ */

/** Zahodená úloha, ktorú sa ešte dá vrátiť. */
interface DroppedFlash {
  taskId: string;
  title: string;
}

/** Ako dlho visí ponuka vrátenia — rovnako ako v inboxe. */
const FLASH_MS = 10_000;
const ERROR_MS = 5000;

export interface TaskDetailProviderProps {
  areas: Area[];
  projects: Project[];
  /** Dnešok z pásma používateľa. Klient si ho nikdy nepočíta sám. */
  todayIso: string;
  /** Od koľkých odkladov sa odznak zobrazí — `settings.postponeWarnAt`. */
  postponeWarnAt: number;
  /** Od koľkých odkladov je odznak červený — `settings.postponeBlockAt`. */
  postponeBlockAt: number;
  children: ReactNode;
}

export function TaskDetailProvider({
  areas,
  projects,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
  children,
}: TaskDetailProviderProps) {
  const [task, setTask] = useState<TaskWithRelations | null>(null);
  /**
   * Poradie otvorenia. Ide do `key` panela, takže každé otvorenie začína
   * s čerstvým rozpracovaným stavom odvodeným z práve odovzdanej úlohy —
   * aj keď je to tá istá úloha ako naposledy.
   */
  const [openSeq, setOpenSeq] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [flash, setFlash] = useState<DroppedFlash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /** Prvok, z ktorého sa panel otvoril — po zatvorení sa naň vráti fokus. */
  const openerRef = useRef<HTMLElement | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);

  const open = useCallback((next: TaskWithRelations) => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    setFlash(null);
    setError(null);
    setTask(next);
    setOpenSeq((seq) => seq + 1);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo<TaskDetailContextValue>(() => ({ open, close }), [open, close]);

  /**
   * Kam sa má vrátiť fokus po zatvorení.
   *
   * Radix vracia fokus na spúšťač z `<DialogTrigger>`; ten tu žiadny nie je,
   * lebo panel sa otvára z kódu. Bez tohto by fokus po zatvorení spadol na
   * `<body>` a klávesnica by začínala odznova na začiatku stránky.
   *
   * Po zahodení je cieľom tlačidlo „Vrátiť späť": pôvodný riadok o chvíľu
   * zmizne zo zoznamu, takže vracať naň fokus nemá zmysel.
   */
  const restoreFocus = useCallback(() => {
    const undoButton = undoRef.current;
    if (undoButton !== null) {
      undoButton.focus();
      return;
    }
    const opener = openerRef.current;
    if (opener !== null && opener.isConnected) opener.focus();
  }, []);

  const handleDropped = useCallback((dropped: DroppedFlash) => {
    setIsOpen(false);
    setError(null);
    setFlash(dropped);
  }, []);

  const undoDrop = useCallback(
    (taskId: string) => {
      setFlash(null);
      startTransition(async () => {
        setError(null);
        try {
          const result = await restoreTask(taskId);
          if (!result.ok) setError(result.error);
        } catch {
          setError("Úlohu sa nepodarilo vrátiť. Skús to znova.");
        }
      });
    },
    [startTransition],
  );

  /* Ctrl+Z vráti posledné zahodenie — rovnaký vzor ako v inboxe. */
  useEffect(() => {
    const taskId = flash?.taskId;
    if (taskId === undefined) return;

    return registerShortcuts([
      {
        keys: "mod+z",
        // Predvolené správanie si zoberieme až vtedy, keď skratku naozaj
        // použijeme — inak by sme používateľovi zhltli undo v textovom poli.
        preventDefault: false,
        run: (event) => {
          if (isTypingTarget(event.target)) return;
          event.preventDefault();
          undoDrop(taskId);
        },
      },
    ]);
  }, [flash, undoDrop]);

  /* Ponuka vrátenia aj hláška o chybe samy zmiznú — nič netreba zatvárať. */
  useEffect(() => {
    if (flash === null) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    if (error === null) return;
    const timer = window.setTimeout(() => setError(null), ERROR_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <TaskDetailContext.Provider value={value}>
      {children}

      {task !== null ? (
        <TaskDetail
          key={`${task.id}:${openSeq}`}
          task={task}
          open={isOpen}
          onOpenChange={setIsOpen}
          onDropped={handleDropped}
          onRestoreFocus={restoreFocus}
          areas={areas}
          projects={projects}
          todayIso={todayIso}
          postponeWarnAt={postponeWarnAt}
          postponeBlockAt={postponeBlockAt}
        />
      ) : null}

      {/* Oblasť je pripojená stále — čítačka ohlási len tú, ktorá už v DOM
          bola, keď sa jej obsah zmení. Nad spodnou lištou a vedľa plávajúceho
          tlačidla zachytenia, aby si na telefóne neprekážali. */}
      <div
        role="status"
        aria-live="polite"
        style={{ bottom: "calc(var(--bar-inset) + 0.75rem)" }}
        className="pointer-events-none fixed left-4 right-20 z-40 md:left-auto md:right-4 md:w-96"
      >
        {flash !== null ? (
          <div
            className={cn(
              "pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded",
              "border border-border bg-surface px-3 py-2 text-[13px] text-fg-muted shadow-md",
            )}
          >
            <span className="min-w-0 truncate">Úloha „{flash.title}" je zahodená.</span>
            <Button
              ref={undoRef}
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => undoDrop(flash.taskId)}
              aria-label={`Vrátiť späť zahodenú úlohu ${flash.title}`}
            >
              <Undo2 size={14} aria-hidden="true" />
              Vrátiť späť
            </Button>
            <span
              aria-hidden="true"
              className="hidden items-center gap-1 text-fg-subtle sm:inline-flex"
            >
              alebo
              <Kbd>Ctrl</Kbd>
              <Kbd>Z</Kbd>
            </span>
          </div>
        ) : null}

        {error !== null ? (
          <p
            className={cn(
              "pointer-events-auto mt-2 rounded border border-danger bg-surface px-3 py-2",
              "text-[13px] font-medium text-danger shadow-md",
            )}
          >
            {error}
          </p>
        ) : null}
      </div>
    </TaskDetailContext.Provider>
  );
}
