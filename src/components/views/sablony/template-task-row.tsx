"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDuration } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TemplateTask } from "@/server/queries/templates";

import {
  DAY_OFFSET_CHOICES,
  ENERGY_CHOICES,
  ESTIMATE_CHOICES,
  PRIORITY_CHOICES,
  dayOffsetLabel,
} from "./template-labels";

/* ═══════════════════════════════════════════════════════════════════════════
   JEDEN RIADOK ŠABLÓNY

   Riadok nie je úloha, ale jej PREDPIS — preto tu nie je termín, projekt ani
   oblasť. Termín je fakt viazaný na konkrétnu situáciu a predpis o nej nič
   nevie; projekt a oblasť sú väzby, ktoré by šablónu pripútali k štruktúre,
   čo sa medzitým mohla premenovať alebo zaniknúť.

   Viditeľné sú preto len dve veci: čo sa má spraviť a ktorý deň. Zvyšok
   (priorita, odhad, energia, kontext, poznámka) je za rozbalením — pri rutine
   ho väčšinou netreba a šesť polí na riadok by z editora spravilo formulár,
   ktorý nikto nevyplní.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Radix Select neberie prázdny reťazec ako hodnotu — „nič" má vlastný kľúč. */
const NONE = "__none__";

/** Šírka poradového čísla plus medzera — polia začínajú pod názvom úlohy. */
const indentClass = "pl-[26px]";

/**
 * Rozpísaný riadok.
 *
 * `key` je stabilný identifikátor, nie poradie: keď sa riadky presúvajú,
 * index ako Reactový kľúč by rozpísaný text presunul do iného riadka.
 */
export interface TaskDraft {
  key: string;
  title: string;
  dayOffset: number;
  priority: number;
  estimateMin: number | null;
  energy: "low" | "mid" | "high" | null;
  context: string;
  note: string;
}

/*
  Kľúče pre riadky pridané za behu. Počítadlo, nie `Date.now()` ani náhoda:
  v klientskom komponente sa na hodiny nesiaha a stúpajúce číslo je aj tak
  jednoznačné. Riadky načítané zo šablóny majú kľúč odvodený od poradia, takže
  vykreslenie na serveri a po hydratácii dá tie isté kľúče.
*/
let addedRows = 0;

/** Prázdny riadok pod tie doterajšie. */
export function newTaskDraft(): TaskDraft {
  addedRows += 1;
  return {
    key: `pridany-${addedRows}`,
    title: "",
    dayOffset: 0,
    // Trojka je predvolená priorita úlohy — predpis nemá byť naliehavejší
    // než to, čo by človek napísal ručne.
    priority: 3,
    estimateMin: null,
    energy: null,
    context: "",
    note: "",
  };
}

/** Uložený riadok → rozpísaný. */
export function taskDraftFrom(task: TemplateTask, index: number): TaskDraft {
  return {
    key: `ulozeny-${index}`,
    title: task.title,
    dayOffset: task.dayOffset ?? 0,
    priority: task.priority ?? 3,
    estimateMin: task.estimateMin ?? null,
    energy: task.energy ?? null,
    context: task.context ?? "",
    note: task.note ?? "",
  };
}

/**
 * Rozpísaný riadok → definícia na uloženie, alebo `null`, keď nemá názov.
 *
 * Prázdne polia sa do `payload` nezapisujú vôbec. Uložené „" by sa pri použití
 * zmenilo na prázdny kontext úlohy — teda na údaj, ktorý tam nikto nedal.
 */
export function draftToTemplateTask(draft: TaskDraft): TemplateTask | null {
  const title = draft.title.trim();
  if (title === "") return null;

  const note = draft.note.trim();
  const context = draft.context.trim();

  return {
    title,
    ...(note !== "" ? { note } : {}),
    ...(draft.priority !== 3 ? { priority: draft.priority } : {}),
    ...(draft.estimateMin !== null ? { estimateMin: draft.estimateMin } : {}),
    ...(draft.energy !== null ? { energy: draft.energy } : {}),
    ...(context !== "" ? { context } : {}),
    ...(draft.dayOffset !== 0 ? { dayOffset: draft.dayOffset } : {}),
  };
}

/** Ponuka doplnená o hodnotu, ktorá v nej nie je — inak by ju výber prepísal. */
function choicesWith(choices: readonly number[], current: number): number[] {
  if (choices.includes(current)) return [...choices];
  return [...choices, current].sort((a, b) => a - b);
}

export interface TemplateTaskRowProps {
  draft: TaskDraft;
  /** Poradie v šablóne, od nuly. Ukazuje sa ako číslo kroku. */
  index: number;
  /** Koľko riadkov šablóna má — posledný sa nedá posunúť nadol. */
  total: number;
  onChange: (patch: Partial<TaskDraft>) => void;
  onRemove: () => void;
  /** −1 nahor, +1 nadol. Poradie krokov rutiny je súčasť predpisu. */
  onMove: (direction: -1 | 1) => void;
  disabled?: boolean;
}

export function TemplateTaskRow({
  draft,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  disabled = false,
}: TemplateTaskRowProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const ids = useId();
  const fieldId = (field: string): string => `${ids}-${field}`;
  const step = index + 1;

  const dayChoices = choicesWith(DAY_OFFSET_CHOICES, draft.dayOffset);

  return (
    <li className="flex min-w-0 flex-col gap-2 rounded border border-border bg-surface-2 p-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden="true"
          className="w-5 shrink-0 text-right text-[12px] font-semibold tabular-nums text-fg-subtle"
        >
          {step}.
        </span>

        <Input
          id={fieldId("title")}
          value={draft.title}
          maxLength={500}
          autoComplete="off"
          disabled={disabled}
          aria-label={`Názov ${step}. úlohy šablóny`}
          placeholder="Čo sa má spraviť"
          onChange={(event) => onChange({ title: event.target.value })}
          className={cn("min-w-0 flex-1")}
        />

        {/* Presun a mazanie sú ikony bez textu — na 375 px by tri tlačidlá
            s menovkami vytlačili názov úlohy do jedného slova. */}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled || index === 0}
          aria-label={`Posunúť ${step}. úlohu vyššie`}
          onClick={() => onMove(-1)}
          className="size-11 shrink-0 sm:size-8"
        >
          <ChevronUp aria-hidden="true" size={15} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled || index === total - 1}
          aria-label={`Posunúť ${step}. úlohu nižšie`}
          onClick={() => onMove(1)}
          className="size-11 shrink-0 sm:size-8"
        >
          <ChevronDown aria-hidden="true" size={15} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          aria-label={`Odobrať ${step}. úlohu zo šablóny`}
          onClick={onRemove}
          className="size-11 shrink-0 text-fg-subtle hover:text-danger sm:size-8"
        >
          <Trash2 aria-hidden="true" size={15} />
        </Button>
      </div>

      {/* Deň je jediné pole, ktoré ostáva vždy vidieť: bez neho je šablóna
          obyčajný zoznam a celý jej zmysel — relatívne dni — sa stratí. */}
      <div className={cn("flex min-w-0 flex-wrap items-center gap-2", indentClass)}>
        <div className="min-w-0 flex-1 basis-40">
          <Select
            value={String(draft.dayOffset)}
            disabled={disabled}
            onValueChange={(value) => onChange({ dayOffset: Number(value) })}
          >
            <SelectTrigger
              aria-label={`Deň ${step}. úlohy oproti dňu použitia`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dayChoices.map((offset) => (
                <SelectItem key={offset} value={String(offset)}>
                  {dayOffsetLabel(offset)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          aria-expanded={detailsOpen}
          aria-controls={fieldId("details")}
          onClick={() => setDetailsOpen((open) => !open)}
          className="h-11 shrink-0 px-2 text-[12px] sm:h-9"
        >
          {detailsOpen ? (
            <ChevronDown aria-hidden="true" size={14} />
          ) : (
            <ChevronRight aria-hidden="true" size={14} />
          )}
          Podrobnosti
        </Button>
      </div>

      {/*
        Skrýva sa atribútom `hidden`, nie odpojením z DOM — `aria-controls`
        musí na niečo ukazovať aj v zabalenom stave. Rozloženie preto nesie
        až vnútorný obal: `display` z triedy by atribút prebil, lebo pravidlo
        prehliadača pre `[hidden]` prehráva s hocijakým autorským štýlom,
        a podrobnosti by boli vidieť stále.
      */}
      <div id={fieldId("details")} hidden={!detailsOpen}>
        <RowDetails
          draft={draft}
          disabled={disabled}
          fieldId={fieldId}
          onChange={onChange}
        />
      </div>
    </li>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PODROBNOSTI RIADKA

   Vlastný komponent, hoci sa používa na jedinom mieste: bez neho by mal riadok
   tri úrovne zanorenia navyše a v takom kóde sa už len ťažko hľadá.
   ═══════════════════════════════════════════════════════════════════════════ */

interface RowDetailsProps {
  draft: TaskDraft;
  disabled: boolean;
  /** Menovky a polia si delia jedno `useId` z riadka, aby na seba ukazovali. */
  fieldId: (field: string) => string;
  onChange: (patch: Partial<TaskDraft>) => void;
}

function RowDetails({ draft, disabled, fieldId, onChange }: RowDetailsProps) {
  const estimateChoices =
    draft.estimateMin === null
      ? [...ESTIMATE_CHOICES]
      : choicesWith(ESTIMATE_CHOICES, draft.estimateMin);

  return (
    <div className={cn("flex flex-col gap-3", indentClass)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor={fieldId("priority")}
            className="text-[12px] font-medium text-fg-muted"
          >
            Priorita
          </label>
          <Select
            value={String(draft.priority)}
            disabled={disabled}
            onValueChange={(value) => onChange({ priority: Number(value) })}
          >
            <SelectTrigger id={fieldId("priority")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_CHOICES.map((choice) => (
                <SelectItem key={choice.value} value={String(choice.value)}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor={fieldId("estimate")}
            className="text-[12px] font-medium text-fg-muted"
          >
            Odhad
          </label>
          <Select
            value={draft.estimateMin === null ? NONE : String(draft.estimateMin)}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({ estimateMin: value === NONE ? null : Number(value) })
            }
          >
            <SelectTrigger id={fieldId("estimate")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Bez odhadu</SelectItem>
              {estimateChoices.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {formatDuration(minutes)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor={fieldId("energy")}
            className="text-[12px] font-medium text-fg-muted"
          >
            Energia
          </label>
          <Select
            value={draft.energy ?? NONE}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({
                energy:
                  value === "low" || value === "mid" || value === "high" ? value : null,
              })
            }
          >
            <SelectTrigger id={fieldId("energy")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Neurčená</SelectItem>
              {ENERGY_CHOICES.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label
          htmlFor={fieldId("context")}
          className="text-[12px] font-medium text-fg-muted"
        >
          Kontext
        </label>
        <Input
          id={fieldId("context")}
          value={draft.context}
          maxLength={64}
          autoComplete="off"
          disabled={disabled}
          placeholder="@pocitac, @telefon, @mesto"
          onChange={(event) => onChange({ context: event.target.value })}
         
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label
          htmlFor={fieldId("note")}
          className="text-[12px] font-medium text-fg-muted"
        >
          Poznámka
        </label>
        {/*
          Natívny `textarea` a nie `Input`: poznámka v predpise býva návod
          („kľúče sú v druhej zásuvke") a ten sa do jedného riadka nezmestí.
        */}
        <textarea
          id={fieldId("note")}
          value={draft.note}
          rows={2}
          maxLength={2000}
          disabled={disabled}
          placeholder="Čo si treba pri tejto úlohe pamätať"
          onChange={(event) => onChange({ note: event.target.value })}
          className={cn(
            "w-full resize-y rounded border border-border bg-surface px-2.5 py-2",
            "text-base leading-relaxed text-fg placeholder:text-fg-subtle sm:text-sm",
            "transition-colors duration-100 ease-out hover:border-border-strong",
            "disabled:pointer-events-none disabled:opacity-45",
          )}
        />
      </div>
    </div>
  );
}
