"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { PartyPopper } from "lucide-react";

import type { Area, Project } from "@/db/schema";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { TaskEmpty } from "@/components/task/task-empty";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { InboxHeader } from "./inbox-header";
import {
  TRIAGE_ACTIONS,
  TRIAGE_ORDER,
  TriageRow,
  runTriage,
  type TriageAction,
} from "./triage-row";

/* ═══════════════════════════════════════════════════════════════════════════
   KLÁVESNICA

   Celý inbox musí ísť prejsť bez myši: j/k alebo šípky posúvajú, číslice
   a x/Backspace rozhodujú. Skratky sú globálne, preto sa musia dôsledne
   vypnúť všade, kde človek píše alebo kde si klávesy berie iný komponent.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Odvodené z jediného zoznamu akcií — klávesa a tlačidlo nikdy nerozídu. */
const KEY_TO_ACTION: Record<string, TriageAction> = Object.fromEntries(
  TRIAGE_ORDER.map((action): [string, TriageAction] => [
    TRIAGE_ACTIONS[action].shortcut,
    action,
  ]),
);

/**
 * Prvky, ktoré si klávesy riešia samy: textové polia a otvorené prekrytia
 * (Radix Select má na spúšťači `combobox`, na zozname `listbox`).
 */
const OWN_KEYS_SELECTOR =
  '[role="combobox"], [role="listbox"], [role="dialog"], [role="menu"]';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.closest(OWN_KEYS_SELECTOR) !== null;
}

/** `KeyboardEvent.key` je pri písmenách citlivý na Shift, pri Backspace nie. */
function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZOZNAM
   ═══════════════════════════════════════════════════════════════════════════ */

/** Stabilná referencia, aby sa optimistický stav po dobehnutí akcie vrátil na prázdno. */
const NOTHING_TRIAGED: readonly string[] = [];

export interface InboxListProps {
  /** Úlohy so stavom „inbox", najstaršie hore. */
  tasks: TaskWithRelations[];
  areas: Area[];
  projects: Project[];
  /** Dnešok z pásma používateľa — aby sa server a klient nerozišli pri hydratácii. */
  todayIso: string;
}

export function InboxList({ tasks, areas, projects, todayIso }: InboxListProps) {
  // Zatriedená vec zmizne hneď; keď akcia dobehne, React sa vráti k dátam
  // zo servera — pri úspechu tam už nie je, pri chybe sa vráti aj s hláškou.
  const [triaged, markTriaged] = useOptimistic<readonly string[], string>(
    NOTHING_TRIAGED,
    (state, id) => (state.includes(id) ? state : [...state, id]),
  );
  const [, startTransition] = useTransition();
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const visible = tasks.filter((task) => !triaged.includes(task.id));
  const lastIndex = visible.length - 1;
  const cursor = visible.length === 0 ? -1 : Math.min(activeIndex, lastIndex);
  const activeTask = visible[cursor];

  const triage = useCallback(
    (action: TriageAction, taskId: string) => {
      startTransition(async () => {
        markTriaged(taskId);
        setError(null);
        try {
          const result = await runTriage(action, taskId);
          if (!result.ok) setError(result.error);
        } catch {
          setError("Zmenu sa nepodarilo uložiť. Skús to znova.");
        }
      });
    },
    [markTriaged, startTransition],
  );

  /* Globálne skratky. */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Ctrl+K a spol. patria palete príkazov, nie triedeniu.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (visible.length === 0) return;

      const key = normalizeKey(event.key);

      if (key === "j" || key === "ArrowDown" || key === "k" || key === "ArrowUp") {
        const delta = key === "j" || key === "ArrowDown" ? 1 : -1;
        event.preventDefault();
        setActiveIndex((current) => {
          const from = Math.min(current, lastIndex);
          return Math.min(Math.max(from + delta, 0), lastIndex);
        });
        return;
      }

      const action = KEY_TO_ACTION[key];
      if (!action) return;
      // Podržaná klávesa by inak prebehla celým inboxom skôr, než sa to dá zastaviť.
      if (event.repeat) return;

      const task = visible[cursor];
      if (!task) return;

      event.preventDefault();
      triage(action, task.id);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, cursor, lastIndex, triage]);

  /* Aktívny riadok musí byť vidieť aj pri dlhom zozname. */
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [cursor, visible.length]);

  /* Hláška o chybe sa nezatvára — sama zmizne. */
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <div>
      <InboxHeader count={visible.length} />

      {error ? (
        <p
          role="status"
          className={cn(
            "mb-3 rounded border border-danger bg-surface px-3 py-2",
            "text-[13px] font-medium text-danger",
          )}
        >
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <TaskEmpty
          icon={<PartyPopper size={26} strokeWidth={1.75} />}
          title="Inbox na nule"
          description="Všetko zachytené má svoje miesto. Nič tu na teba nečaká — choď robiť to, čo si si naplánoval."
          action={
            <Link
              href="/dnes"
              className={cn(
                "inline-flex h-9 items-center justify-center rounded border border-border bg-surface px-3",
                "text-sm font-medium text-fg transition-colors duration-100 ease-out",
                "hover:border-border-strong hover:bg-surface-2",
              )}
            >
              Prejsť na Dnes
            </Link>
          }
        />
      ) : (
        <>
          <ul ref={listRef} className="flex flex-col gap-2">
            {visible.map((task, index) => (
              <TriageRow
                key={task.id}
                task={task}
                areas={areas}
                projects={projects}
                active={index === cursor}
                onActivate={() => setActiveIndex(index)}
                onTriage={(action) => triage(action, task.id)}
                onError={setError}
                todayIso={todayIso}
              />
            ))}
          </ul>

          <ShortcutLegend />

          {/* Čítačky sa dozvedia, na ktorom riadku klávesnica stojí. */}
          <p aria-live="polite" className="sr-only">
            {activeTask
              ? `Vybraná úloha ${cursor + 1} z ${visible.length}: ${activeTask.title}`
              : ""}
          </p>
        </>
      )}
    </div>
  );
}

/** Tichá pripomienka skratiek — nemá kradnúť pozornosť zoznamu. */
function ShortcutLegend() {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 pt-3 text-[11px] text-fg-subtle">
      <span className="inline-flex items-center gap-1">
        <Kbd>j</Kbd>
        <Kbd>k</Kbd>
        alebo
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        pohyb
      </span>
      {TRIAGE_ORDER.map((action) => (
        <span key={action} className="inline-flex items-center gap-1">
          <Kbd>{TRIAGE_ACTIONS[action].shortcut}</Kbd>
          {TRIAGE_ACTIONS[action].label.toLowerCase()}
        </span>
      ))}
    </p>
  );
}
