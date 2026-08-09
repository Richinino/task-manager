"use client";

import {
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ChevronDown, ChevronUp, LoaderCircle, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { SubtaskView } from "@/components/task/task-detail-data";
import {
  addSubtask,
  deleteTask,
  reorderSubtasks,
  toggleTaskDone,
  updateTask,
} from "@/server/actions/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   KONTROLNÝ ZOZNAM PODÚLOH

   Rozbitie úlohy na kroky. Jedna úroveň, žiadny strom — server druhú úroveň
   odmieta, takže sa vnorené pridávanie ani neponúka.
   Podúloha dedí projekt aj oblasť od rodiča; robí to `addSubtask`, nie my.

   Všetko sa prekresľuje okamžite a ukladá na pozadí. Keď server odmietne,
   zoznam sa vráti do podoby spred zásahu a povie sa prečo — rovnaký vzor
   ako v samotnom detaile úlohy.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Predpona dočasného identifikátora. Práve pridaná podúloha sa kreslí skôr,
 * než jej server pridelí id — dovtedy sa s ňou nedá hýbať ani ju odškrtnúť,
 * lebo server o nej ešte nevie.
 */
const TEMP_PREFIX = "tmp:";

function isTemp(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}

export interface SubtaskListProps {
  /** Úloha, pod ktorú kroky patria. */
  parentTaskId: string;
  subtasks: SubtaskView[];
  /**
   * Setter, nie `onChange(next)`: pri rýchlom klikaní beží viac zápisov naraz
   * a funkčná aktualizácia je jediný spôsob, ako sa neoprieť o zastaraný stav.
   */
  setSubtasks: Dispatch<SetStateAction<SubtaskView[]>>;
}

export function SubtaskList({
  parentTaskId,
  subtasks,
  setSubtasks,
}: SubtaskListProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Počítadlo dočasných identifikátorov. `Date.now()` by pri dvoch krokoch
   * napísaných v tej istej milisekunde vyrobilo dva rovnaké kľúče a React by
   * jeden z riadkov zahodil.
   */
  const tempSeqRef = useRef(0);

  const total = subtasks.length;
  const done = subtasks.filter((subtask) => subtask.done).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  /** Ktorákoľvek podúloha ešte čaká na svoje id — presúvať sa zatiaľ nedá. */
  const settling = subtasks.some((subtask) => isTemp(subtask.id));

  /**
   * Spoločný postup pre všetky zmeny: prekresli hneď, ulož na pozadí,
   * pri neúspechu vráť presne ten zoznam, ktorý platil pred zásahom.
   */
  function commit(
    next: SubtaskView[],
    run: () => Promise<{ ok: true } | { ok: false; error: string }>,
    fallback: string,
  ): void {
    const before = subtasks;
    setSubtasks(next);
    setError(null);

    startTransition(async () => {
      try {
        const result = await run();
        if (result.ok) return;
        setSubtasks(before);
        setError(result.error);
      } catch {
        setSubtasks(before);
        setError(fallback);
      }
    });
  }

  /* ── pridanie ──────────────────────────────────────────────────────────── */

  function add(): void {
    const title = value.trim();
    if (title === "") return;

    const tempId = `${TEMP_PREFIX}${(tempSeqRef.current += 1)}`;
    const before = subtasks;

    // Pole sa vyprázdni a ostáva otvorené — kroky sa píšu jeden za druhým.
    setValue("");
    setError(null);
    setSubtasks((previous) => [...previous, { id: tempId, title, done: false }]);
    inputRef.current?.focus();

    function giveUp(message: string): void {
      setSubtasks(before);
      setError(message);
      // Text sa nesmie stratiť — vraciame ho len vtedy, keď sa medzitým
      // nezačal písať ďalší krok.
      setValue((current) => (current === "" ? title : current));
    }

    startTransition(async () => {
      try {
        const result = await addSubtask(parentTaskId, title);
        if (!result.ok) {
          giveUp(result.error);
          return;
        }
        // Dočasné id vymeníme za skutočné — až potom sa dá podúloha odškrtnúť.
        const realId = result.data.id;
        setSubtasks((previous) =>
          previous.map((subtask) =>
            subtask.id === tempId ? { ...subtask, id: realId } : subtask,
          ),
        );
      } catch {
        giveUp("Podúlohu sa nepodarilo pridať. Skús to znova.");
      }
    });
  }

  /* ── odškrtnutie ───────────────────────────────────────────────────────── */

  function toggle(id: string): void {
    if (isTemp(id)) return;

    const current = subtasks.find((subtask) => subtask.id === id);
    const wasDone = current?.done === true;

    commit(
      subtasks.map((subtask) =>
        subtask.id === id ? { ...subtask, done: !subtask.done } : subtask,
      ),
      async () => {
        const result = await toggleTaskDone(id);
        if (!result.ok) return result;

        /*
          Dorovnanie stavu. `toggleTaskDone` vracia odškrtnutú úlohu do `todo`,
          a keď nemá deň ani projekt, do `inbox` — lenže inbox sa filtruje podľa
          stavu, takže podúloha bez projektu by sa po odškrtnutí objavila
          v nezatriedených veciach ako samostatná úloha. Podúloha do inboxu
          nepatrí nikdy: `addSubtask` jej rovno dáva `todo` a tu ju tam vraciame.
        */
        if (wasDone) {
          const placed = await updateTask(id, { status: "todo" });
          if (!placed.ok) return placed;
        }
        return { ok: true };
      },
      "Stav podúlohy sa nepodarilo zmeniť.",
    );
  }

  /* ── poradie ───────────────────────────────────────────────────────────── */

  /**
   * Presun o jedno miesto. Šípky sú tu namiesto ťahania zámerne: klávesová
   * alternatíva je povinná a dve tlačidlá ju spĺňajú bez ďalšej vrstvy —
   * navyše sú to jediné ovládanie, ktoré funguje aj prstom v úzkom paneli.
   */
  function move(index: number, delta: number): void {
    const target = index + delta;
    const current = subtasks[index];
    const neighbour = subtasks[target];
    if (current === undefined || neighbour === undefined) return;

    const next = [...subtasks];
    next[index] = neighbour;
    next[target] = current;

    // Dočasné id server nepozná — poradie posielame bez nich, vzájomné
    // poradie uložených podúloh tým ostáva nedotknuté.
    const ids = next.filter((subtask) => !isTemp(subtask.id)).map((subtask) => subtask.id);

    commit(
      next,
      () => reorderSubtasks(parentTaskId, ids),
      "Poradie sa nepodarilo uložiť.",
    );
  }

  /* ── odobratie ─────────────────────────────────────────────────────────── */

  function remove(id: string): void {
    if (isTemp(id)) return;
    commit(
      subtasks.filter((subtask) => subtask.id !== id),
      () => deleteTask(id),
      "Podúlohu sa nepodarilo zahodiť.",
    );
  }

  /* ── vykreslenie ───────────────────────────────────────────────────────── */

  const inputId = `${parentTaskId}-subtask`;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Postup nad zoznamom. Keď kroky nie sú, nie je čo merať. */}
      {total > 0 ? (
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[12px] font-medium text-fg-muted">
            {done} z {total}
          </span>
          <span
            aria-hidden="true"
            className="h-1 min-w-0 flex-1 overflow-hidden rounded bg-surface-2"
          >
            <span
              style={{ width: `${percent}%` }}
              className={cn(
                "block h-full rounded transition-[width] duration-150 ease-out",
                done === total ? "bg-success" : "bg-accent",
              )}
            />
          </span>
          {isPending ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin text-fg-subtle"
            />
          ) : null}
        </div>
      ) : null}

      {total > 0 ? (
        <ul className="flex min-w-0 flex-col">
          {subtasks.map((subtask, index) => {
            const pendingRow = isTemp(subtask.id);
            return (
              <li
                key={subtask.id}
                className={cn(
                  "flex min-w-0 items-center gap-1.5 border-b border-border last:border-b-0",
                  // Na telefóne má riadok 44 px, aby sa doň zmestili dotykové
                  // plochy políčka aj šípok; od `md` sa hustota vracia.
                  "min-h-11 md:min-h-9",
                  pendingRow && "opacity-60",
                )}
              >
                <Checkbox
                  checked={subtask.done}
                  disabled={pendingRow}
                  onCheckedChange={() => toggle(subtask.id)}
                  aria-label={`Hotovo: ${subtask.title}`}
                  className="ml-1 size-5 shrink-0"
                />

                {/*
                  Text je zároveň veľkým dotykovým cieľom políčka. Pre klávesnicu
                  a čítačku je skrytý — ovládacím prvkom ostáva samotné políčko,
                  aby v zozname neboli dva prvky na tú istú vec.
                */}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  disabled={pendingRow}
                  onClick={() => toggle(subtask.id)}
                  className={cn(
                    "min-h-11 min-w-0 flex-1 truncate rounded px-1 text-left text-sm md:min-h-0",
                    subtask.done ? "text-fg-subtle line-through" : "text-fg",
                  )}
                  title={subtask.title}
                >
                  {subtask.title}
                </button>

                <RowButton
                  label={`Posunúť vyššie: ${subtask.title}`}
                  disabled={index === 0 || settling}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp aria-hidden="true" size={15} />
                </RowButton>
                <RowButton
                  label={`Posunúť nižšie: ${subtask.title}`}
                  disabled={index === total - 1 || settling}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown aria-hidden="true" size={15} />
                </RowButton>
                <RowButton
                  label={`Zahodiť podúlohu: ${subtask.title}`}
                  disabled={pendingRow}
                  danger
                  onClick={() => remove(subtask.id)}
                >
                  <X aria-hidden="true" size={15} />
                </RowButton>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Pole ostáva otvorené aj po uložení — kroky sa píšu v jednom slede. */}
      <div className="flex min-w-0 items-center gap-1.5">
        <label htmlFor={inputId} className="sr-only">
          Nová podúloha
        </label>
        <Input
          id={inputId}
          ref={inputRef}
          value={value}
          maxLength={500}
          placeholder="Ďalší krok…"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setValue(event.target.value);
            if (error !== null) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            if (event.nativeEvent.isComposing) return;
            // Enter obsluhujeme sami — panel žiadny formulár nemá a implicitné
            // odoslanie by sa nemalo o čo oprieť.
            event.preventDefault();
            add();
          }}
          className="h-11 min-w-0 flex-1 text-base md:h-9 md:text-sm"
        />
        {/* Bez klávesnice je toto jediná cesta, ako krok uložiť. */}
        <RowButton
          label="Pridať podúlohu"
          disabled={value.trim() === ""}
          onClick={add}
          // Vedľa 44 px vysokého poľa musí byť tlačidlo rovnako vysoké —
          // inak sa o pár pixelov míňa a na dotyk sa naň ťažko trafí.
          className="size-11 border border-border bg-surface md:size-9"
        >
          <Plus aria-hidden="true" size={16} />
        </RowButton>
      </div>

      {error !== null ? (
        <p role="alert" className="text-[11px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DROBNOSTI
   ═══════════════════════════════════════════════════════════════════════════ */

interface RowButtonProps {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}

/**
 * Ovládanie riadku. 36 px pod `md` je kompromis: štyri ovládacie prvky vedľa
 * seba a názov kroku sa do 375 px inak nezmestia bez pretečenia. Nad WCAG 2.2
 * SC 2.5.8 (24 px) je to stále s rezervou.
 */
function RowButton({
  label,
  disabled = false,
  danger = false,
  onClick,
  className,
  children,
}: RowButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded md:size-8",
        "text-fg-subtle transition-colors duration-100 ease-out",
        "disabled:pointer-events-none disabled:opacity-35",
        danger
          ? "hover:bg-danger/10 hover:text-danger"
          : "hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}
