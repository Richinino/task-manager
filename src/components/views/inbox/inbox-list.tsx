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
import { PartyPopper, Undo2 } from "lucide-react";

import type { Area, Project } from "@/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { TaskEmpty } from "@/components/task/task-empty";
import { restoreTask } from "@/server/actions/tasks";
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

/**
 * Tiché potvrdenie posledného rozhodnutia.
 *
 * Pri zmazaní nesie aj `undoTaskId` — zahodenie je jediná akcia, ktorú sa
 * inak nedá vrátiť, a Backspace je príliš blízko bežnej svalovej pamäti,
 * než aby stačilo „zmizlo a hotovo". Potvrdzovací dialóg by triedenie brzdil,
 * preto sa maže hneď a späť sa dá vrátiť z tejto hlášky.
 */
interface Flash {
  message: string;
  undoTaskId?: string;
  /** Názov úlohy do menovky tlačidla — čítačke pri tabovaní nestačí okolitý text. */
  undoTitle?: string;
}

/** Ako dlho hláška visí — pri ponuke vrátenia musí byť čas si to rozmyslieť. */
const FLASH_MS = { plain: 5000, undo: 10_000 } as const;

export interface InboxListProps {
  /** Úlohy so stavom „inbox", najstaršie hore. */
  tasks: TaskWithRelations[];
  areas: Area[];
  projects: Project[];
  /** Dnešok z pásma používateľa — aby sa server a klient nerozišli pri hydratácii. */
  todayIso: string;
  /** Od koľkých odkladov sa odznak zobrazí — `settings.postponeWarnAt`. */
  postponeWarnAt: number;
  /** Od koľkých odkladov je odznak červený — `settings.postponeBlockAt`. */
  postponeBlockAt: number;
}

export function InboxList({
  tasks,
  areas,
  projects,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: InboxListProps) {
  // Zatriedená vec zmizne hneď; keď akcia dobehne, React sa vráti k dátam
  // zo servera — pri úspechu tam už nie je, pri chybe sa vráti aj s hláškou.
  const [triaged, markTriaged] = useOptimistic<readonly string[], string>(
    NOTHING_TRIAGED,
    (state, id) => (state.includes(id) ? state : [...state, id]),
  );
  const [, startTransition] = useTransition();
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  /** Úloha, ktorú sa práve dá vrátiť späť — null, keď niet čo vracať. */
  const undoTaskId = flash?.undoTaskId;

  const visible = tasks.filter((task) => !triaged.includes(task.id));
  const lastIndex = visible.length - 1;
  const cursor = visible.length === 0 ? -1 : Math.min(activeIndex, lastIndex);
  const activeTask = visible[cursor];

  const triage = useCallback(
    (action: TriageAction, taskId: string) => {
      const meta = TRIAGE_ACTIONS[action];
      const found = tasks.find((task) => task.id === taskId)?.title;
      const named = found ? `Úloha „${found}"` : "Úloha";

      startTransition(async () => {
        // „Niekedy" úlohu v inboxe vedome necháva — skryť ju optimisticky by
        // znamenalo, že po revalidácii zase preblikne späť.
        if (meta.leavesInbox) markTriaged(taskId);
        setError(null);
        setFlash(null);
        try {
          const result = await runTriage(action, taskId, todayIso);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          if (action === "drop") {
            setFlash({
              message: `${named} je zahodená.`,
              undoTaskId: taskId,
              undoTitle: found,
            });
          } else if (action === "someday") {
            setFlash({
              message: `${named} je odložená na niekedy. Ostáva v inboxe, kým jej nedáš konkrétny deň.`,
            });
          }
        } catch {
          setError("Zmenu sa nepodarilo uložiť. Skús to znova.");
        }
      });
    },
    [markTriaged, startTransition, tasks, todayIso],
  );

  /** Vráti späť posledné zahodenie. Volá to tlačidlo v hláške aj Ctrl+Z. */
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

  /* Globálne skratky. */
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

      const key = normalizeKey(event.key);

      // Ctrl+Z vráti posledné zahodenie. Mimo textového poľa prehliadač
      // aj tak nemá čo vracať, takže si klávesu môžeme vziať.
      if (
        key === "z" &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey
      ) {
        if (!undoTaskId) return;
        event.preventDefault();
        undoDrop(undoTaskId);
        return;
      }

      // Ctrl+K a spol. patria palete príkazov, nie triedeniu.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (visible.length === 0) return;

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
  }, [visible, cursor, lastIndex, triage, undoTaskId, undoDrop]);

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

  /* To isté pre potvrdenie; s ponukou vrátenia visí dlhšie. */
  useEffect(() => {
    if (!flash) return;
    const ms = flash.undoTaskId ? FLASH_MS.undo : FLASH_MS.plain;
    const timer = window.setTimeout(() => setFlash(null), ms);
    return () => window.clearTimeout(timer);
  }, [flash]);

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

      {/* Oblasť je pripojená stále — čítačka ohlási len tú, ktorá už v DOM bola,
          keď sa jej obsah zmení. */}
      <div role="status" aria-live="polite">
        {flash ? (
          <div
            className={cn(
              "mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded border border-border",
              "bg-surface-2 px-3 py-2 text-[13px] text-fg-muted",
            )}
          >
            <span className="min-w-0">{flash.message}</span>
            {undoTaskId ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => undoDrop(undoTaskId)}
                  aria-label={
                    flash.undoTitle
                      ? `Vrátiť späť zahodenú úlohu ${flash.undoTitle}`
                      : "Vrátiť späť zahodenú úlohu"
                  }
                  // Vrátenie zahodenia je na telefóne jediná záchrana —
                  // Ctrl+Z tam nikto nestlačí. Preto plných 44 px.
                  className="h-11 shrink-0 px-3 sm:h-7 sm:px-2"
                >
                  <Undo2 size={14} aria-hidden="true" />
                  Vrátiť späť
                </Button>
                {/* Klávesová alternatíva má zmysel len tam, kde je klávesnica. */}
                <span className="hidden items-center gap-1 text-fg-subtle sm:inline-flex">
                  alebo
                  <Kbd>Ctrl</Kbd>
                  <Kbd>Z</Kbd>
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <TaskEmpty
          icon={<PartyPopper size={26} strokeWidth={1.75} />}
          title="Inbox na nule"
          description="Všetko zachytené má svoje miesto. Nič tu na teba nečaká — choď robiť to, čo si si naplánoval."
          action={
            <Link
              href="/dnes"
              className={cn(
                "inline-flex h-11 items-center justify-center rounded border border-border bg-surface px-4 sm:h-9 sm:px-3",
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
                postponeWarnAt={postponeWarnAt}
                postponeBlockAt={postponeBlockAt}
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

/**
 * Tichá pripomienka skratiek — nemá kradnúť pozornosť zoznamu.
 *
 * Na telefóne klávesnica nie je, takže legenda je tam len šum pod zoznamom —
 * pod `sm:` sa preto vôbec nezobrazuje. Skratky samotné ostávajú funkčné
 * (napr. pripojená klávesnica na tablete), len sa nepripomínajú.
 */
function ShortcutLegend() {
  return (
    <p className="hidden flex-wrap items-center gap-x-3 gap-y-1.5 px-1 pt-3 text-[11px] text-fg-subtle sm:flex">
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
      <span className="inline-flex items-center gap-1">
        <Kbd>Ctrl</Kbd>
        <Kbd>Z</Kbd>
        vrátiť zahodenie
      </span>
    </p>
  );
}
