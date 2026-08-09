"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { CalendarClock, Lightbulb, ListTodo, X, type LucideIcon } from "lucide-react";

import {
  activeTokens,
  applyToken,
  removeToken,
  type SyntaxEdit,
  type SyntaxKind,
  type SyntaxOptions,
  type SyntaxValue,
} from "@/lib/capture-syntax";
import { formatDayMonthSk, formatDuration, formatLongSk } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Ťukateľné čipy pod poľom rýchleho zachytenia.
 *
 * Parser vedel termín aj energiu odjakživa — len to na obrazovke nebolo vidieť
 * a bez klávesnice sa to nedalo pohodlne napísať. Čipy sú preto iba **skratka
 * k písaniu**: nedržia žiadny vlastný stav, len VKLADAJÚ SYNTAX DO TEXTU cez
 * `applyToken`/`removeToken`. Text ostáva jediným zdrojom pravdy, živý náhľad
 * parsera beží ďalej a používateľ sa syntax naučí mimochodom — vidí v poli,
 * čo mu ťuknutie vložilo.
 *
 * Z toho plynie celé správanie:
 * - aktívny je ten čip, ktorého hodnotu parser v texte naozaj našiel
 *   (`activeTokens`) — nie ten, na ktorý sa naposledy ťuklo,
 * - ťuknutie na aktívny čip hodnotu odstráni (omyl sa musí dať odvolať),
 * - ťuknutie na inú hodnotu toho istého druhu ju nahradí, lebo `applyToken`
 *   prepisuje existujúci token na jeho mieste.
 *
 * Fokus a kurzor vracia do poľa volajúci — dostane ich v `SyntaxEdit`.
 *
 * **Výnimka z pravidla „čipy iba vkladajú text":** prepínač Úloha/Nápad na
 * začiatku radu. Ten do textu nevkladá nič — rozhoduje o tom, KAM sa text
 * uloží. Preto ho drží volajúci v stave a sem chodí propom. Je to jediný
 * ovládací prvok v rade, ktorý sa v texte neodzrkadlí, a preto je aj jediný,
 * ktorý má farbu plnej akcie: zámena úlohy za nápad je omyl, ktorý sa musí
 * dať odhaliť pohľadom, nie čítaním.
 */

/** Kam smeruje rýchle zachytenie — do úloh, alebo do nápadov. */
export type CaptureMode = "task" | "idea";

export interface CaptureChipsProps {
  /** Aktuálny text poľa. Jediný zdroj pravdy pre aktívne čipy. */
  text: string;
  /** Nový text a pozícia kurzora. Volajúci ich zapíše do stavu a vráti fokus. */
  onEdit: (edit: SyntaxEdit) => void;
  /** Úloha, alebo nápad. V režime nápadu sa ostatné čipy nevykreslia vôbec. */
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  /** Prvý deň týždňa — kvôli zhode s parserom v náhľade. */
  weekStartsOn?: number;
  className?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   VZHĽAD ČIPU
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Na telefóne 44 px na výšku aj na šírku — pod tým sa do čipu netrafí palec.
 * Od `sm` sa čipy stiahnu, tam sa mieri myšou a miesta je málo inak.
 */
const CHIP_BASE = [
  "inline-flex select-none items-center justify-center gap-1 whitespace-nowrap",
  "rounded border font-medium leading-none",
  "h-11 min-w-11 px-3 text-[13px]",
  "sm:h-7 sm:min-w-0 sm:px-2 sm:text-[12px]",
  "transition-[background-color,border-color,color] duration-100 ease-out",
].join(" ");

const CHIP_IDLE =
  "border-border bg-surface text-fg-muted hover:border-border-strong hover:bg-surface-2 hover:text-fg";

/**
 * Aktívny čip nesie farbu svojho významu — tú istú, akou sa priorita a energia
 * kreslia všade inde. Priorita 3 je predvolená a tichá, preto namiesto výraznej
 * farby dostane silný okraj a plný text; inak by sa od nečinného čipu nelíšila.
 */
const ACTIVE_PRIORITY: Record<1 | 2 | 3, string> = {
  1: "border-p1/60 bg-p1/10 text-p1",
  2: "border-p2/60 bg-p2/10 text-p2",
  3: "border-p3 bg-p3/15 text-fg",
};

const ACTIVE_ENERGY: Record<"low" | "mid" | "high", string> = {
  low: "border-energy-low/60 bg-energy-low/10 text-energy-low",
  mid: "border-energy-mid/60 bg-energy-mid/10 text-energy-mid",
  high: "border-energy-high/60 bg-energy-high/10 text-energy-high",
};

/** Odhad a termín vlastnú farbu nemajú — dostanú akcent. */
const ACTIVE_ACCENT = "border-accent/60 bg-accent-soft text-accent";

/**
 * Zapnutá strana prepínača Úloha/Nápad. Zámerne plná akcentová plocha, nie
 * jemný `bg-accent-soft` ako pri ostatných čipoch: toto nie je značka v texte,
 * ale rozhodnutie o tom, čo z napísaného vznikne. Musí byť vidieť z druhého
 * konca miestnosti.
 */
const ACTIVE_MODE = "border-accent bg-accent text-accent-fg";

function Chip({
  label,
  pressed,
  activeClass,
  onClick,
  children,
}: {
  /** Celý popis pre čítačku — na čipe je len skratka („!1"). */
  label: string;
  pressed: boolean;
  activeClass: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={cn(
        CHIP_BASE,
        pressed ? cn(activeClass, "font-semibold") : CHIP_IDLE,
      )}
    >
      {children}
    </button>
  );
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-1"
    >
      {/* Popis skupiny počuje čítačka z `aria-label`; nahlas by znel dvakrát. */}
      <span
        aria-hidden="true"
        className="pr-0.5 text-[11px] leading-none text-fg-subtle"
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HODNOTY
   ═══════════════════════════════════════════════════════════════════════════ */

const PRIORITY_VALUES: ReadonlyArray<1 | 2 | 3> = [1, 2, 3];

const ENERGY_VALUES: ReadonlyArray<{ value: "low" | "mid" | "high"; label: string }> = [
  { value: "low", label: "nízka" },
  { value: "mid", label: "stredná" },
  { value: "high", label: "vysoká" },
];

/** Na čipe je rovno tvar, ktorý sa vloží do textu — to je celá výuka syntaxe. */
const ESTIMATE_VALUES: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 15, label: "15m" },
  { minutes: 30, label: "30m" },
  { minutes: 60, label: "1h" },
];

/**
 * Dve strany prepínača. Popis pre čítačku hovorí celú vetu — samotné „Nápad"
 * by z rady čipov znelo ako ďalšia značka, nie ako voľba cieľa.
 */
const MODE_OPTIONS: ReadonlyArray<{
  value: CaptureMode;
  label: string;
  description: string;
  Icon: LucideIcon;
}> = [
  {
    value: "task",
    label: "Úloha",
    description: "Uložiť ako úlohu — záväzok s dátumom a prioritou",
    Icon: ListTodo,
  },
  {
    value: "idea",
    label: "Nápad",
    description: "Uložiť ako nápad — možnosť bez dátumu a priority",
    Icon: Lightbulb,
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   KOMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export function CaptureChips({
  text,
  onEdit,
  mode,
  onModeChange,
  weekStartsOn = 1,
  className,
}: CaptureChipsProps) {
  const dateRef = useRef<HTMLInputElement>(null);

  const options = useMemo<SyntaxOptions>(() => ({ weekStartsOn }), [weekStartsOn]);
  // `parseCapture` je čistá a lacná funkcia — pokojne beží pri každom znaku.
  const active = useMemo(() => activeTokens(text, options), [text, options]);

  /** Rovnaká hodnota = odstránenie, iná hodnota toho istého druhu = nahradenie. */
  function toggle<K extends SyntaxKind>(
    kind: K,
    value: SyntaxValue[K],
    pressed: boolean,
  ): void {
    onEdit(
      pressed
        ? removeToken(text, kind, options)
        : applyToken(text, kind, value, options),
    );
  }

  /**
   * Natívny výber dátumu. Na telefóne je to najlepšie, čo sa dá ponúknuť —
   * vlastný kalendár by bol horší a väčší.
   *
   * `showPicker` nemá každý prehliadač a vie ho aj odmietnuť (bez gesta
   * používateľa). Vtedy pole aspoň zaostríme a klikneme naň — mobilné
   * prehliadače si výber otvoria samy.
   */
  function openDatePicker(): void {
    const el = dateRef.current;
    if (el === null) return;
    try {
      el.showPicker();
      return;
    } catch {
      /* padá sa na náhradný postup nižšie */
    }
    el.focus();
    el.click();
  }

  const due = active.due;

  return (
    <div
      role="group"
      aria-label="Rýchle značky"
      className={cn(
        /*
          Na telefóne je jeden riadok, ktorý sa vodorovne roluje — zalomenie do
          troch riadkov by odtlačilo tlačidlo „Uložiť" pod vysunutú klávesnicu.
          Od `sm` je miesta dosť a čipy sa zalomia.

          Zvislé `py` tu nie je ozdoba: rolovací kontajner odrezáva všetko za
          vnútorným okrajom, a fokusový krúžok presahuje presne 4 px (2 px
          odsadenie + 2 px hrúbka). Menej ako `py-1` sa dať nedá.
        */
        "flex items-center gap-3 overflow-x-auto py-1",
        "sm:flex-wrap sm:gap-x-4 sm:gap-y-2 sm:overflow-x-visible",
        className,
      )}
    >
      {/*
        Prepínač je prvý v rade a na telefóne teda vždy viditeľný bez rolovania.
        Za ním nasledujú značky, ktoré platia len pre úlohu.
      */}
      <ChipGroup label="Ukladám">
        {MODE_OPTIONS.map((option) => {
          const on = mode === option.value;
          const Icon = option.Icon;
          return (
            <button
              key={option.value}
              type="button"
              aria-label={option.description}
              aria-pressed={on}
              title={option.description}
              onClick={() => onModeChange(option.value)}
              className={cn(CHIP_BASE, on ? cn(ACTIVE_MODE, "font-semibold") : CHIP_IDLE)}
            >
              <Icon aria-hidden="true" size={14} className="shrink-0" />
              {option.label}
            </button>
          );
        })}
      </ChipGroup>

      {/*
        Nápad nemá termín, prioritu ani odhad — `createIdea` také polia vôbec
        nepozná. Ponúkať čipy, ktorých hodnotu by server zahodil, by bola lož,
        preto sa celý zvyšok radu v režime nápadu nevykreslí. Čo si človek
        napíše ručne, uvidí preškrtnuté v náhľade nad čipmi.
      */}
      {mode === "idea" ? null : (
        <>
          {/* Termín je prvý zámerne — práve ten sa v poli nedal nájsť. */}
          <ChipGroup label="Termín">
            <span className="relative inline-flex">
              <Chip
                label={
                  due === undefined
                    ? "Termín — otvorí výber dátumu"
                    : `Termín ${formatLongSk(due)} — otvorí výber dátumu`
                }
                pressed={due !== undefined}
                activeClass={ACTIVE_ACCENT}
                onClick={openDatePicker}
              >
                <CalendarClock aria-hidden="true" size={14} className="shrink-0" />
                {due === undefined ? "vybrať" : formatDayMonthSk(due)}
              </Chip>

              {/*
                Pole leží presne na čipe, len je priehľadné: natívny výber sa
                otvorí tam, kde človek ťukol, nie v rohu obrazovky. Klikať sa naň
                nedá (`pointer-events-none`) — ovládacím prvkom je tlačidlo.
              */}
              <input
                ref={dateRef}
                type="date"
                tabIndex={-1}
                aria-label="Termín — výber dátumu"
                value={due ?? ""}
                onChange={(event) => {
                  const iso = event.target.value;
                  onEdit(
                    iso === ""
                      ? removeToken(text, "due", options)
                      : applyToken(text, "due", iso, options),
                  );
                }}
                onKeyDown={(event) => {
                  // Enter v poli dátumu nesmie odoslať formulár — úloha ešte nie je dopísaná.
                  if (event.key === "Enter") event.preventDefault();
                }}
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
              />
            </span>

            {/* Vymazať termín sa musí dať aj bez toho, aby sa otváral výber. */}
            {due !== undefined ? (
              <button
                type="button"
                aria-label={`Zrušiť termín ${formatLongSk(due)}`}
                title="Zrušiť termín"
                onClick={() => onEdit(removeToken(text, "due", options))}
                className={cn(
                  CHIP_BASE,
                  CHIP_IDLE,
                  "px-0 hover:text-danger sm:min-w-7 sm:px-0",
                )}
              >
                <X aria-hidden="true" size={14} className="shrink-0" />
              </button>
            ) : null}
          </ChipGroup>

          <ChipGroup label="Energia">
            {ENERGY_VALUES.map((item) => {
              const pressed = active.energy === item.value;
              return (
                <Chip
                  key={item.value}
                  label={`${item.label} energia`}
                  pressed={pressed}
                  activeClass={ACTIVE_ENERGY[item.value]}
                  onClick={() => toggle("energy", item.value, pressed)}
                >
                  {item.label}
                </Chip>
              );
            })}
          </ChipGroup>

          <ChipGroup label="Priorita">
            {PRIORITY_VALUES.map((value) => {
              const pressed = active.priority === value;
              return (
                <Chip
                  key={value}
                  label={`Priorita ${value}`}
                  pressed={pressed}
                  activeClass={ACTIVE_PRIORITY[value]}
                  onClick={() => toggle("priority", value, pressed)}
                >
                  <span className="font-mono">!{value}</span>
                </Chip>
              );
            })}
          </ChipGroup>

          <ChipGroup label="Odhad">
            {ESTIMATE_VALUES.map((item) => {
              const pressed = active.estimate === item.minutes;
              return (
                <Chip
                  key={item.minutes}
                  label={`Odhad ${formatDuration(item.minutes)}`}
                  pressed={pressed}
                  activeClass={ACTIVE_ACCENT}
                  onClick={() => toggle("estimate", item.minutes, pressed)}
                >
                  <span className="font-mono">{item.label}</span>
                </Chip>
              );
            })}
          </ChipGroup>
        </>
      )}
    </div>
  );
}
