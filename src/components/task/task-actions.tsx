"use client";

import type * as React from "react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  CalendarOff,
  CalendarRange,
  Check,
  Ellipsis,
  Pencil,
  RotateCcw,
  Star,
  Sun,
  Sunrise,
  Trash2,
  Undo2,
} from "lucide-react";

import { addDays, formatDayMonthSk, startOfWeek } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PriorityDot } from "@/components/task/priority-dot";
import { useTaskDetail } from "@/components/task/task-detail-provider";
import {
  deleteTask,
  rescheduleTask,
  restoreTask,
  setFrog,
  toggleTaskDone,
  updateTask,
} from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   SPOLOČNÉ TYPY
   ═══════════════════════════════════════════════════════════════════════════ */

/** Rovnaký tvar ako `ActionResult<void>`, len bez väzby na `"use server"` modul. */
type Result = { ok: true } | { ok: false; error: string };

/**
 * Čo z úlohy vie menu prekresliť skôr, než odpovie server.
 *
 * Riadok si tieto polia drží v `useOptimistic`, takže zmena je vidieť
 * okamžite a po dobehnutí akcie sa ticho vráti k údajom zo servera.
 */
export interface TaskRowPatch {
  priority?: number;
  isFrog?: boolean;
  done?: boolean;
  plannedDate?: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZAHODENIE S MOŽNOSŤOU VRÁTENIA

   Zmazanie je jediná akcia, ktorú si človek nevie vziať späť sám, a v menu
   je na dosah myši. Preto sa nemaže hneď: riadok sa premení na pásik
   „Zahodené — Vrátiť späť" a `deleteTask` odíde až po uplynutí okna.

   Prečo takto a nie „zmaž hneď, potom ponúkni restoreTask": `deleteTask`
   revaliduje obrazovky, riadok zmizne zo zoznamu a s ním by zmizla aj ponuka
   vrátenia — človek by ju nestihol ani prečítať. Zoznamy patria iným
   komponentom, takže hlášku nemá kam odložiť. Odklad zápisu je jediné miesto,
   kde sa ponuka dá udržať pri živote.

   Poistky: odchod z obrazovky zahodenie dokončí (nesmie sa ticho stratiť)
   a keby zápis predsa len prebehol skôr, „Vrátiť späť" siahne po `restoreTask`.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Koľko času má človek na to, aby si zahodenie rozmyslel. */
const DISCARD_UNDO_MS = 6000;

export interface TaskDiscard {
  /** Riadok sa má tváriť ako zahodený a ponúknuť vrátenie. */
  discarded: boolean;
  /** Chyba zápisu — riadok ju ukáže a sama zmizne. */
  error: string | null;
  discard: () => void;
  undo: () => void;
}

export function useTaskDiscard(taskId: string): TaskDiscard {
  const [discarded, setDiscarded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /** Zápis už odišiel — vrátiť sa dá len cez `restoreTask`. */
  const committed = useRef(false);
  /** Človek zahodenie zrušil — dokončiť sa už nesmie. */
  const cancelled = useRef(false);

  const commit = useCallback(() => {
    if (committed.current) return;
    committed.current = true;

    function recover(message: string) {
      committed.current = false;
      cancelled.current = true;
      setDiscarded(false);
      setError(message);
    }

    void deleteTask(taskId)
      .then((result) => {
        if (!result.ok) recover(result.error);
      })
      .catch(() => recover("Úlohu sa nepodarilo zahodiť. Skús to znova."));
  }, [taskId]);

  useEffect(() => {
    if (!discarded) return;
    const timer = window.setTimeout(commit, DISCARD_UNDO_MS);
    return () => {
      window.clearTimeout(timer);
      // Riadok mizne z obrazovky (odchod inam, obnova dát) a človek zahodenie
      // nezrušil — dokončíme ho hneď, inak by úloha ticho ostala.
      if (!cancelled.current) commit();
    };
  }, [discarded, commit]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const discard = useCallback(() => {
    cancelled.current = false;
    committed.current = false;
    setError(null);
    setDiscarded(true);
  }, []);

  const undo = useCallback(() => {
    cancelled.current = true;
    setDiscarded(false);
    // Stihli sme to pred zápisom — netreba nič vracať.
    if (!committed.current) return;

    startTransition(async () => {
      try {
        const result = await restoreTask(taskId);
        if (!result.ok) setError(result.error);
      } catch {
        setError("Úlohu sa nepodarilo vrátiť. Skús to znova.");
      }
    });
  }, [taskId]);

  return { discarded, error, discard, undo };
}

/** Riadok v stave „zahodené" — na mieste úlohy, aby bolo vrátenie po ruke. */
export function DiscardedRow({
  title,
  compact = false,
  onUndo,
}: {
  title: string;
  compact?: boolean;
  onUndo: () => void;
}) {
  const undoRef = useRef<HTMLButtonElement>(null);

  // Fokus preberáme až v ďalšom snímku — Popover si po zatvorení vracia
  // fokus na spúšťač, ktorý práve zanikol, a inak by skončil na <body>.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => undoRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      role="status"
      className={cn(
        "flex w-full rounded border border-dashed border-border bg-surface px-2 py-1.5",
        "text-fg-muted",
        compact
          ? "flex-col items-start gap-1 text-[11px]"
          : "items-center gap-2 text-[13px]",
      )}
    >
      <span className="flex min-w-0 max-w-full items-center gap-1.5">
        <Trash2 aria-hidden="true" size={compact ? 12 : 14} className="shrink-0" />
        <span className="min-w-0 truncate">Zahodené: {title}</span>
      </span>

      <Button
        ref={undoRef}
        type="button"
        size="sm"
        variant="secondary"
        onClick={onUndo}
        aria-label={`Vrátiť späť zahodenú úlohu „${title}"`}
        className={compact ? "ml-auto" : "ml-auto shrink-0"}
      >
        <Undo2 aria-hidden="true" size={13} />
        Vrátiť späť
      </Button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HLÁŠKA O CHYBE

   Rovnaký tvar ako v `TaskCheckbox` — nenápadná, sama zmizne, nič netreba
   zatvárať. Riadok ju vie použiť aj pre zlyhané zahodenie.
   ═══════════════════════════════════════════════════════════════════════════ */

export function RowError({ message }: { message: string }) {
  return (
    <span
      role="status"
      className={cn(
        "pointer-events-none absolute right-0 top-full z-20 mt-1 rounded border border-danger",
        "bg-surface px-1.5 py-0.5 text-[11px] font-medium text-danger shadow-sm",
        // Bez `w-max` by sa hláška zmestila len do šírky svojho obalu — a tým
        // je pri menu 28 px široké tlačidlo, takže by spadla na jedno písmeno
        // v riadku. `max-w` ju zároveň udrží v okne telefónu.
        "w-max max-w-[calc(100vw-2rem)]",
      )}
    >
      {message}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   POLOŽKA MENU
   ═══════════════════════════════════════════════════════════════════════════ */

interface MenuItemProps {
  icon: ReactNode;
  label: string;
  /** Doplnok vpravo — napríklad konkrétny dátum za „Budúci týždeň". */
  hint?: string;
  /**
   * `menuitem` (default), `menuitemradio` pre prioritu 1/2/3,
   * `menuitemcheckbox` pre prioritu dňa.
   */
  role?: "menuitem" | "menuitemradio" | "menuitemcheckbox";
  checked?: boolean;
  tone?: "default" | "danger";
  onSelect: () => void;
}

function MenuItem({
  icon,
  label,
  hint,
  role = "menuitem",
  checked,
  tone = "default",
  onSelect,
}: MenuItemProps) {
  return (
    <button
      type="button"
      role={role}
      // Roving tabindex: po menu sa chodí šípkami, Tab z neho vedie von.
      tabIndex={-1}
      aria-checked={role === "menuitem" ? undefined : checked === true}
      onClick={onSelect}
      className={cn(
        "flex min-h-9 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px]",
        "transition-colors duration-100 ease-out",
        tone === "danger"
          ? "text-danger hover:bg-danger/10"
          : "text-fg hover:bg-surface-2",
        "focus-visible:bg-surface-2",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 shrink-0 items-center justify-center",
          tone === "danger" ? "text-danger" : "text-fg-muted",
        )}
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1 truncate">{label}</span>

      {hint ? (
        <span aria-hidden="true" className="shrink-0 text-[11px] text-fg-subtle">
          {hint}
        </span>
      ) : null}

      {checked === true ? (
        <Check aria-hidden="true" size={14} className="shrink-0 text-accent" />
      ) : null}
    </button>
  );
}

/** Pomenovaná skupina položiek. Nadpis je len pre oko — rolu nesie `aria-label`. */
function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p
        aria-hidden="true"
        className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle"
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MENU AKCIÍ
   ═══════════════════════════════════════════════════════════════════════════ */

export interface TaskActionsProps {
  /** Úloha aj s prípadnými optimistickými zmenami, ktoré riadok práve kreslí. */
  task: TaskWithRelations;
  /**
   * Dnešok zo servera ako RRRR-MM-DD (pásmo z nastavení používateľa).
   * Klient si dnešok nepočíta — inak by sa „dnes" v menu rozišlo so serverom.
   */
  todayIso: string;
  /** compact = riadok v týždennom stĺpci, full = obrazovka Dnes/Inbox */
  density?: "compact" | "full";
  /** Okamžité prekreslenie riadku, kým beží zápis. */
  onOptimistic: (patch: TaskRowPatch) => void;
  /** Riadok sa má prepnúť do stavu „zahodené" s ponukou vrátenia. */
  onDiscard: () => void;
  className?: string;
}

export function TaskActions({
  task,
  todayIso,
  density = "full",
  onOptimistic,
  onDiscard,
  className,
}: TaskActionsProps) {
  const compact = density === "compact";
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  // Panel s detailom nemusí byť nad riadkom nasadený — potom sa „Upraviť…"
  // jednoducho nezobrazí a zvyšok menu funguje ďalej.
  const detail = useTaskDetail();

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const isDone = task.status === "done";
  const plannedDate = task.plannedDate;

  /**
   * Spustí akciu: menu sa zavrie, riadok sa prekreslí hneď a až potom sa čaká
   * na server. `onOptimistic` musí ísť pred `await`, inak už nie je v rozsahu
   * prechodu a `useOptimistic` by ho ignoroval.
   */
  const run = useCallback(
    (patch: TaskRowPatch, action: () => Promise<Result>, fallback: string) => {
      setOpen(false);
      setError(null);
      startTransition(async () => {
        onOptimistic(patch);
        try {
          const result = await action();
          if (!result.ok) setError(result.error);
        } catch {
          setError(fallback);
        }
      });
    },
    [onOptimistic],
  );

  /**
   * Presun na deň (alebo odobratie dňa) a dorovnanie stavu.
   *
   * `rescheduleTask` mení len dátum, stav necháva tak. Bez dorovnania by
   * úloha naplánovaná z inboxu v inboxe ostala (inbox filtruje `status`)
   * a úloha, ktorej deň zoberieme, by nebola nikde — Dnes, Týždeň aj Mesiac
   * filtrujú podľa dátumu. Je to ten istý dôvod, pre ktorý dorovnáva stav
   * aj triedenie v inboxe.
   */
  const planOn = useCallback(
    async (date: string | null): Promise<Result> => {
      const moved = await rescheduleTask(task.id, date);
      if (!moved.ok) return moved;

      if (date !== null) {
        return task.status === "inbox"
          ? updateTask(task.id, { status: "todo" })
          : { ok: true };
      }

      // Uzavretá úloha ani úloha v projekte sa do inboxu vracať nemá —
      // nájdeš ju tam, kde patrí.
      const closed = task.status === "done" || task.status === "dropped";
      const placed = task.projectId !== null;
      return !closed && !placed && task.status !== "inbox"
        ? updateTask(task.id, { status: "inbox" })
        : { ok: true };
    },
    [task.id, task.projectId, task.status],
  );

  /* ── klávesnica ──────────────────────────────────────────────────────── */

  const menuItems = useCallback((): HTMLElement[] => {
    const root = menuRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
  }, []);

  const focusItem = useCallback(
    (index: number) => {
      const items = menuItems();
      if (items.length === 0) return;
      const wrapped = ((index % items.length) + items.length) % items.length;
      items[wrapped]?.focus();
    },
    [menuItems],
  );

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = menuItems();
    if (items.length === 0) return;
    const current = items.findIndex((item) => item === document.activeElement);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(current + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusItem(current === -1 ? -1 : current - 1);
        return;
      case "Home":
        event.preventDefault();
        focusItem(0);
        return;
      case "End":
        event.preventDefault();
        focusItem(items.length - 1);
        return;
      default:
        // Escape a Tab si berie Popover: zavrie sa a vráti fokus na spúšťač.
        return;
    }
  }

  /* ── menu ────────────────────────────────────────────────────────────── */

  const menuLabel = `Akcie úlohy „${task.title}"`;
  const nextWeek = addDays(startOfWeek(todayIso), 7);

  return (
    <span className={cn("relative flex shrink-0 items-center", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={menuLabel}
            aria-haspopup="menu"
            title="Akcie úlohy"
            // Bez zastavenia by ťah začal dnd-kit a riadok by sa zároveň vybral.
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "relative flex shrink-0 items-center justify-center rounded border border-transparent",
              "transition-colors duration-100 ease-out",
              "hover:bg-surface-2 hover:text-fg",
              // V týždennom stĺpci má menu ostať v pozadí, ale nie zmiznúť —
              // dotykový cieľ preto ostáva 24 px, mení sa len kontrast.
              compact
                ? "size-6 text-fg-subtle"
                : "size-7 text-fg-muted",
              // Na telefóne rozšíri dotykovú plochu plného riadku na 44×44 px
              // (28 + 2×8) neviditeľný pseudoprvok — vizuálne tlačidlo ostáva
              // rovnako malé a riadok sa nerozšíri ani o pixel. Presah sa
              // presne zmestí do medzery `gap-2`, takže susedný odznak ani
              // názov úlohy neprekryje. Od `sm:` sa ruší: myš mieri presne
              // a hover na prázdnom mieste by mýlil.
              !compact &&
                "before:absolute before:-inset-2 before:content-[''] sm:before:hidden",
              open && "border-border bg-surface-2 text-fg",
            )}
          >
            <Ellipsis aria-hidden="true" size={compact ? 14 : 16} />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          aria-label={menuLabel}
          // Na telefóne sa menu nesmie roztiahnuť cez okraj obrazovky.
          className="w-60 max-w-[calc(100vw-1.5rem)]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            focusItem(0);
          }}
          // Kliknutie v menu nesmie prebublať do riadku pod ním.
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div
            ref={menuRef}
            role="menu"
            aria-label={menuLabel}
            aria-orientation="vertical"
            onKeyDown={handleMenuKeyDown}
          >
            {detail ? (
              <>
                <MenuItem
                  icon={<Pencil size={14} />}
                  label="Upraviť…"
                  onSelect={() => {
                    setOpen(false);
                    detail.open(task);
                  }}
                />
                <MenuSeparator />
              </>
            ) : null}

            <MenuGroup label="Naplánovať">
              <MenuItem
                icon={<Sun size={14} />}
                label="Na dnes"
                onSelect={() =>
                  run(
                    { plannedDate: todayIso },
                    () => planOn(todayIso),
                    "Úlohu sa nepodarilo preplánovať. Skús to znova.",
                  )
                }
              />
              <MenuItem
                icon={<Sunrise size={14} />}
                label="Na zajtra"
                onSelect={() => {
                  const date = addDays(todayIso, 1);
                  run(
                    { plannedDate: date },
                    () => planOn(date),
                    "Úlohu sa nepodarilo preplánovať. Skús to znova.",
                  );
                }}
              />
              <MenuItem
                icon={<CalendarRange size={14} />}
                label="Na budúci týždeň"
                hint={formatDayMonthSk(nextWeek)}
                onSelect={() =>
                  run(
                    { plannedDate: nextWeek },
                    () => planOn(nextWeek),
                    "Úlohu sa nepodarilo preplánovať. Skús to znova.",
                  )
                }
              />
              {plannedDate !== null ? (
                <MenuItem
                  icon={<CalendarOff size={14} />}
                  label="Odobrať z plánu"
                  onSelect={() =>
                    run(
                      { plannedDate: null, isFrog: false },
                      () => planOn(null),
                      "Úlohu sa nepodarilo odobrať z plánu. Skús to znova.",
                    )
                  }
                />
              ) : null}
            </MenuGroup>

            <MenuSeparator />

            <MenuGroup label="Priorita">
              {([1, 2, 3] as const).map((level) => (
                <MenuItem
                  key={level}
                  role="menuitemradio"
                  checked={task.priority === level}
                  icon={<PriorityDot priority={level} size="sm" />}
                  label={`Priorita ${level}`}
                  onSelect={() =>
                    run(
                      { priority: level },
                      () => updateTask(task.id, { priority: level }),
                      "Prioritu sa nepodarilo zmeniť. Skús to znova.",
                    )
                  }
                />
              ))}

              {/* Prioritou dňa môže byť len úloha s naplánovaným dňom — server
                  to odmietne, tak to ani neponúkame. */}
              {plannedDate !== null ? (
                <MenuItem
                  role="menuitemcheckbox"
                  checked={task.isFrog}
                  icon={
                    <Star
                      size={14}
                      className={task.isFrog ? "fill-current text-frog" : undefined}
                    />
                  }
                  label={task.isFrog ? "Zrušiť prioritu dňa" : "Priorita dňa"}
                  onSelect={() =>
                    run(
                      { isFrog: !task.isFrog },
                      () => setFrog(task.id, !task.isFrog),
                      "Prioritu dňa sa nepodarilo nastaviť. Skús to znova.",
                    )
                  }
                />
              ) : null}
            </MenuGroup>

            <MenuSeparator />

            <MenuItem
              icon={isDone ? <RotateCcw size={14} /> : <Check size={14} />}
              label={isDone ? "Vrátiť medzi nedokončené" : "Označiť ako hotovú"}
              onSelect={() =>
                run(
                  { done: !isDone },
                  async () => {
                    const result = await toggleTaskDone(task.id);
                    return result.ok ? { ok: true } : result;
                  },
                  "Stav úlohy sa nepodarilo zmeniť. Skús to znova.",
                )
              }
            />

            <MenuItem
              icon={<Trash2 size={14} />}
              label="Zahodiť"
              tone="danger"
              onSelect={() => {
                setOpen(false);
                onDiscard();
              }}
            />
          </div>
        </PopoverContent>
      </Popover>

      {error ? <RowError message={error} /> : null}
    </span>
  );
}
