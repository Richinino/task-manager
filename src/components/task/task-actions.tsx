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
  Anchor,
  Archive,
  Ellipsis,
  Hourglass,
  Pencil,
  Star,
  Sun,
  Sunrise,
  Trash2,
  Undo2,
} from "lucide-react";

import { addDays, formatDayMonthSk, formatDuration, startOfWeek } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ESTIMATE_CHOICES } from "@/components/views/sablony/template-labels";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PriorityDot } from "@/components/task/priority-dot";
import { usePostponeGuard } from "@/components/task/postpone-guard";
import { useTaskDetail } from "@/components/task/task-detail-provider";
import {
  deleteTask,
  rescheduleTask,
  restoreTask,
  setFrog,
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
/*
  Odškrtnutie tu zámerne nie je: to si drží `TaskCheckbox`, ktorý je v riadku
  vždy. Kým ho ponúkalo aj menu, existovali dve cesty k tomu istému poľu a dve
  optimistické kópie jeho stavu.
*/
export interface TaskRowPatch {
  staysOnDay?: boolean;
  priority?: number;
  isFrog?: boolean;
  plannedDate?: string | null;
  estimateMin?: number | null;
  status?: "waiting";
  horizon?: "someday";
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
          ? "flex-col items-start gap-1 text-mini"
          : "items-center gap-2 text-body",
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
        aria-label={`Vrátiť späť zahodenú úlohu „${title}“`}
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
        "bg-surface px-1.5 py-0.5 text-mini font-medium text-danger shadow-sm",
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
        "flex min-h-9 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-body",
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
        <span aria-hidden="true" className="shrink-0 text-mini text-fg-subtle">
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
        className="label px-2 pb-0.5 pt-1 text-fg-subtle"
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

/**
 * Priorita ako jeden vodorovný rad, nie tri riadky pod sebou.
 *
 * Tri úrovne nie sú tri akcie — je to jedno pole s tromi hodnotami. Ako tri
 * samostatné položky zaberali štvrtinu menu a čítali sa ako ponuka, hoci je
 * to prepínač; navyše sa dve z troch nikdy nehodili, lebo jedna už platí.
 *
 * Rad je preto **jedna zastávka** zvislej navigácie a medzi hodnotami sa
 * chodí šípkami vľavo/vpravo — presne tak, ako sa v skupine prepínačov chodí
 * všade inde. Zvislé šípky doň vstupujú na práve platnej hodnote, nie na
 * prvej, takže sa fokus nezačína inde, než je zaškrtnutie.
 */
/**
 * Odhad na jedno kliknutie priamo z riadku.
 *
 * Rozpočet dňa je presne taký dobrý, ako sú odhady — a „Bez odhadu: 4 úlohy"
 * pod pruhom bolo dovtedy len napomenutie, ktoré sa nedalo poslúchnuť inde
 * než v detaile. Tu je to jedno kliknutie a šesť hodnôt, ktoré appka používa
 * všade inde (5 / 15 / 30 / 60 / 120 / 240).
 *
 * Opakovaný klik na tú istú hodnotu odhad zruší — inak by sa raz nastavený
 * odhad nedal z menu odobrať.
 */
function MenuEstimateRow({
  value,
  onPick,
}: {
  value: number | null;
  onPick: (minutes: number | null) => void;
}) {
  return (
    <div role="group" aria-label="Odhad času" className="flex flex-wrap gap-1 px-2 py-0.5">
      {ESTIMATE_CHOICES.map((minutes) => {
        const checked = value === minutes;
        return (
          <button
            key={minutes}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            aria-label={`Odhad ${formatDuration(minutes)}`}
            data-row="estimate"
            tabIndex={-1}
            onClick={() => onPick(checked ? null : minutes)}
            className={cn(
              "flex min-h-9 min-w-[52px] flex-1 items-center justify-center rounded border",
              "font-mono text-body tabular-nums transition-colors duration-100 ease-out",
              checked
                ? "border-accent bg-accent/10 font-medium text-fg"
                : "border-border text-fg-muted hover:bg-surface-2 hover:text-fg",
              "focus-visible:bg-surface-2",
            )}
          >
            {formatDuration(minutes)}
          </button>
        );
      })}
    </div>
  );
}

function MenuPriorityRow({
  value,
  onPick,
}: {
  value: number;
  onPick: (level: 1 | 2 | 3) => void;
}) {
  return (
    <div role="group" aria-label="Úroveň priority" className="flex gap-1 px-2 py-0.5">
      {([1, 2, 3] as const).map((level) => {
        const checked = value === level;
        return (
          <button
            key={level}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            aria-label={`Priorita ${level}`}
            // Podľa tohto atribútu vie klávesnica, že tieto tri patria k sebe.
            data-row="priority"
            tabIndex={-1}
            onClick={() => onPick(level)}
            className={cn(
              "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded border",
              "text-body transition-colors duration-100 ease-out",
              checked
                ? "border-accent bg-accent/10 font-medium text-fg"
                : "border-border text-fg-muted hover:bg-surface-2 hover:text-fg",
              "focus-visible:bg-surface-2",
            )}
          >
            <PriorityDot priority={level} size="sm" />
            {level}
          </button>
        );
      })}
    </div>
  );
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
  const guard = usePostponeGuard();

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

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
      /*
        Cez strážcu, nie priamo: keď server odklad zastaví prahom, otvorí sa
        dialóg a tento prísľub sa vyrieši až po rozhodnutí. Bez providera
        (napr. v náhľade) sa volá priamo a blok sa prejaví len hláškou.
      */
      const moved = guard
        ? await guard.postpone({
            taskId: task.id,
            title: task.title,
            plannedDate: date,
            task,
          })
        : await rescheduleTask(task.id, date);
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
    [guard, task],
  );

  /* ── klávesnica ──────────────────────────────────────────────────────── */

  const menuItems = useCallback((): HTMLElement[] => {
    const root = menuRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
  }, []);

  /**
   * Zastávky **zvislej** navigácie.
   *
   * Z vodorovného radu priority je medzi nimi len jedna — tá zaškrtnutá —
   * inak by šípka nadol prešla tri hodnoty toho istého poľa ako tri položky
   * a fokus by pritom skákal do strán.
   */
  const menuStops = useCallback((): HTMLElement[] => {
    const all = menuItems();
    const row = all.filter((item) => item.dataset["row"] === "priority");
    // Zaškrtnutá je vždy práve jedna, ale poistka pre prípad neplatnej
    // hodnoty v dátach: rad nesmie zo zoznamu vypadnúť celý.
    const entry =
      row.find((item) => item.getAttribute("aria-checked") === "true") ?? row[0];
    return all.filter((item) => item.dataset["row"] !== "priority" || item === entry);
  }, [menuItems]);

  /** Súrodenci v tom istom vodorovnom rade — prázdne, ak fokus v rade nie je. */
  const rowSiblings = useCallback(
    (element: Element | null): HTMLElement[] => {
      const row = (element as HTMLElement | null)?.dataset["row"];
      if (row === undefined) return [];
      return menuItems().filter((item) => item.dataset["row"] === row);
    },
    [menuItems],
  );

  const focusAt = useCallback((items: HTMLElement[], index: number) => {
    if (items.length === 0) return;
    const wrapped = ((index % items.length) + items.length) % items.length;
    items[wrapped]?.focus();
  }, []);

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const active = document.activeElement;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const row = rowSiblings(active);
      if (row.length === 0) return;
      event.preventDefault();
      const at = row.findIndex((item) => item === active);
      focusAt(row, at + (event.key === "ArrowRight" ? 1 : -1));
      return;
    }

    const stops = menuStops();
    if (stops.length === 0) return;

    /*
      Fokus môže sedieť na hodnote, ktorá medzi zastávkami nie je — po kroku
      do strany stojí napríklad na „Priorita 3", zatiaľ čo rad zastupuje
      zaškrtnutá jednotka. Vtedy sa za súčasnú zastávku berie zástupca radu,
      inak by sa šípka nadol vrátila na začiatok menu.
    */
    const activeRow = (active as HTMLElement | null)?.dataset["row"];
    const current = stops.findIndex(
      (item) =>
        item === active ||
        (activeRow !== undefined && item.dataset["row"] === activeRow),
    );

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(stops, current + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusAt(stops, current === -1 ? -1 : current - 1);
        return;
      case "Home":
        event.preventDefault();
        focusAt(stops, 0);
        return;
      case "End":
        event.preventDefault();
        focusAt(stops, stops.length - 1);
        return;
      default:
        // Escape a Tab si berie Popover: zavrie sa a vráti fokus na spúšťač.
        return;
    }
  }

  /* ── menu ────────────────────────────────────────────────────────────── */

  const menuLabel = `Akcie úlohy „${task.title}“`;
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
          /*
            Menu sa nesmie roztiahnuť cez okraj obrazovky — ani do šírky, ani
            do výšky. `--radix-popover-content-available-height` je presne
            miesto, ktoré od spúšťača po okraj okna zostáva; menu si z neho
            vezme, koľko potrebuje, a zvyšok odroluje.

            Bez toho spodok menu („Odložiť", „Zahodiť") končil pod okrajom
            obrazovky a nedal sa doskrolovať — položka tam bola, ale nedalo
            sa na ňu dostať.
          */
          className={cn(
            "flex w-60 max-w-[calc(100vw-1.5rem)] flex-col",
            "max-h-[min(var(--radix-popover-content-available-height),30rem)]",
            "overflow-y-auto overscroll-contain",
          )}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            focusAt(menuStops(), 0);
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
            className="min-h-0"
            // Fokus behá po položkách, nie po menu — ale samotné menu musí byť
            // zaostriteľné aspoň programovo, inak je to podľa ARIA neúplný
            // widget. `-1` ho drží mimo poradia klávesy Tab.
            tabIndex={-1}
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

            {/*
              Len pre úlohu, ktorá deň vôbec má — inak nie je čoho sa držať.
            */}
            {plannedDate !== null ? (
              <MenuItem
                role="menuitemcheckbox"
                checked={task.staysOnDay}
                icon={<Anchor size={14} />}
                label={task.staysOnDay ? "Môže sa presunúť" : "Patrí svojmu dňu"}
                onSelect={() =>
                  run(
                    { staysOnDay: !task.staysOnDay },
                    () => updateTask(task.id, { staysOnDay: !task.staysOnDay }),
                    "Nastavenie sa nepodarilo uložiť. Skús to znova.",
                  )
                }
              />
            ) : null}

            <MenuSeparator />

            <MenuGroup label="Odhad">
              <MenuEstimateRow
                value={task.estimateMin}
                onPick={(minutes) =>
                  run(
                    { estimateMin: minutes },
                    () => updateTask(task.id, { estimateMin: minutes }),
                    "Odhad sa nepodarilo uložiť. Skús to znova.",
                  )
                }
              />
            </MenuGroup>

            <MenuSeparator />

            <MenuGroup label="Priorita">
              <MenuPriorityRow
                value={task.priority}
                onPick={(level) =>
                  run(
                    { priority: level },
                    () => updateTask(task.id, { priority: level }),
                    "Prioritu sa nepodarilo zmeniť. Skús to znova.",
                  )
                }
              />

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

            {/*
              Odloženie nie je zahodenie a človek to potrebuje oveľa častejšie.
              Doteraz sa z riadku dalo len zahodiť — takže sa buď zahadzovalo
              to, čo malo len počkať, alebo úloha visela v dni donekonečna.
            */}
            <MenuGroup label="Odložiť">
              <MenuItem
                icon={<Archive size={14} />}
                label="Do Niekedy"
                onSelect={() =>
                  run(
                    /*
                      „Niekedy" je HORIZONT, nie stav — zásobáreň, nie iná fáza
                      úlohy. Zároveň sa odoberá z plánu: inak by ostala visieť
                      v dni, z ktorého ju človek práve odkladá.
                    */
                    { horizon: "someday", plannedDate: null },
                    () =>
                      updateTask(task.id, { horizon: "someday", plannedDate: null }),
                    "Úlohu sa nepodarilo odložiť. Skús to znova.",
                  )
                }
              />
              <MenuItem
                icon={<Hourglass size={14} />}
                label="Čaká sa na niekoho"
                onSelect={() =>
                  run(
                    { status: "waiting" },
                    () => updateTask(task.id, { status: "waiting" }),
                    "Úlohu sa nepodarilo odložiť. Skús to znova.",
                  )
                }
              />
            </MenuGroup>

            <MenuSeparator />

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
