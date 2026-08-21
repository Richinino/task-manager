"use client";

import { useRef, useState, useTransition } from "react";

import { WEEKDAYS_SHORT_SK, WEEKDAYS_SK, parseIsoDate } from "@/lib/dates";
import {
  describeRecurrence,
  formatRecurrence,
  parseRecurrence,
  weekdayOf,
  type Recurrence,
} from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setRecurrence } from "@/server/actions/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   VÝBER OPAKOVANIA

   Skladanie ani čítanie pravidla sa tu nedeje — na to je `@/lib/recurrence`.
   Tento komponent len drží, čo má človek naklikané, a po každej zmene pošle
   hotový RRULE zápis do `setRecurrence`. Keby si zápis skladal sám, existovali
   by dve miesta, ktoré musia rozumieť tomu istému formátu, a jedno z nich by
   sa skôr či neskôr rozišlo s parserom.

   Ukladá sa hneď pri zmene, bez tlačidla „Uložiť" — rovnako ako ostatné polia
   panela. Keď server odmietne, výber sa vráti na poslednú potvrdenú podobu.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Rovnaký tvar ako `ActionResult`, len bez väzby na modul s „use server". */
type SaveResult = { ok: true } | { ok: false; error: string };

/** Štyri možnosti, ktoré appka vie — viac ich parser aj tak nerozpozná. */
type Mode = "none" | "daily" | "weekly" | "monthly";

const MODES: { value: Mode; label: string }[] = [
  { value: "none", label: "Neopakuje sa" },
  { value: "daily", label: "Každý deň" },
  { value: "weekly", label: "Vybrané dni" },
  { value: "monthly", label: "Deň v mesiaci" },
];

/**
 * Poradie, v akom sa dni ponúkajú — pondelok prvý, ako je oko zvyknuté.
 * Sú to priamo indexy podľa `Date#getDay()` (0 = nedeľa), lebo presne v tom
 * hovorí `Recurrence.byDay`; prepočet by bol ďalšie miesto, kde sa dá pomýliť.
 *
 * Názvy dní sem zámerne nepíšeme — sú v `@/lib/dates` a berie si ich odtiaľ aj
 * mesačná mriežka a parser. Druhá kópia by sa raz rozišla a ten istý deň by sa
 * na dvoch obrazovkách volal inak.
 */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const MONTH_DAYS: number[] = Array.from({ length: 31 }, (_, index) => index + 1);

/** Čo má človek naklikané. Dni aj deň v mesiaci si držíme aj mimo svojho
 *  režimu, aby sa prepnutím tam a späť nestratil predošlý výber. */
interface Choice {
  mode: Mode;
  /** Pri režime „vybrané dni". Nikdy prázdne — viď `toggleDay`. */
  byDay: number[];
  /** Pri režime „deň v mesiaci", 1–31. */
  byMonthDay: number;
}

/**
 * Deň v mesiaci z ISO dátumu.
 *
 * Ide cez `parseIsoDate`, nie cez vlastné krájanie reťazca: appka má čítať
 * dátum všade rovnako, inak by tu vznikla tretia predstava o tom, čo je platný
 * dátum. Nezmysel padne na prvého — výber musí mať platnú hodnotu vždy.
 */
function monthDayOf(iso: string): number {
  const day = parseIsoDate(iso).getDate();
  return Number.isNaN(day) ? 1 : day;
}

/**
 * Uložené pravidlo → stav výberu.
 *
 * Nepoužité vetvy sa predvyplnia podľa `anchorIso`: keď človek prepne na
 * „vybrané dni", chce najčastejšie práve ten deň, na ktorý je úloha
 * naplánovaná. Prázdny výber by pravidlo neposkladal a prepnutie režimu by
 * navonok nespravilo nič.
 */
function toChoice(rule: string | null, anchorIso: string): Choice {
  const parsed = parseRecurrence(rule);
  const fallback: Omit<Choice, "mode"> = {
    byDay: [weekdayOf(anchorIso)],
    byMonthDay: monthDayOf(anchorIso),
  };

  if (parsed === null) return { ...fallback, mode: "none" };
  if (parsed.freq === "daily") return { ...fallback, mode: "daily" };

  if (parsed.freq === "weekly") {
    const byDay = parsed.byDay ?? [];
    return {
      ...fallback,
      mode: "weekly",
      byDay: byDay.length > 0 ? byDay : fallback.byDay,
    };
  }

  return {
    ...fallback,
    mode: "monthly",
    byMonthDay: parsed.byMonthDay ?? fallback.byMonthDay,
  };
}

/** Výber → pravidlo. `null` znamená „neopakuje sa". */
function toRecurrence(choice: Choice): Recurrence | null {
  if (choice.mode === "none") return null;
  if (choice.mode === "daily") return { freq: "daily" };
  if (choice.mode === "weekly") return { freq: "weekly", byDay: choice.byDay };
  return { freq: "monthly", byMonthDay: choice.byMonthDay };
}

/** To, čo ide do databázy. Zápis skladá výhradne `formatRecurrence`. */
function toRule(choice: Choice): string | null {
  const recurrence = toRecurrence(choice);
  return recurrence === null ? null : formatRecurrence(recurrence);
}

export interface RecurrencePickerProps {
  taskId: string;
  /** Uložené pravidlo v RRULE zápise; `null`, keď sa úloha neopakuje. */
  rule: string | null;
  /**
   * Deň, z ktorého sa odvodia predvoľby pri prepnutí režimu — naplánovaný deň
   * úlohy, inak dnešok zo servera. Číta sa len pri prvom vykreslení.
   */
  anchorIso: string;
}

export function RecurrencePicker({ taskId, rule, anchorIso }: RecurrencePickerProps) {
  const [choice, setChoice] = useState<Choice>(() => toChoice(rule, anchorIso));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /** Posledný výber potvrdený serverom — sem sa vraciame, keď zápis zlyhá. */
  const savedRef = useRef<Choice>(toChoice(rule, anchorIso));

  /**
   * Prekreslí hneď, uloží na pozadí.
   *
   * Ako cieľ návratu slúži posledná POTVRDENÁ podoba, nie tá práve zobrazená:
   * pri rýchlom klikaní beží viac zápisov naraz a vrátiť sa do medzistavu,
   * ktorý server nikdy nevidel, by bolo horšie než nevrátiť sa vôbec.
   */
  function apply(next: Choice): void {
    const previous = savedRef.current;
    setChoice(next);
    setError(null);

    const nextRule = toRule(next);
    // Zmena, ktorú pravidlo nevidí (napr. ten istý deň znova), nemá čo ukladať.
    if (nextRule === toRule(previous)) {
      savedRef.current = next;
      return;
    }

    startTransition(async () => {
      const revert = (message: string): void => {
        setChoice(previous);
        setError(message);
      };

      try {
        const result: SaveResult = await setRecurrence(taskId, nextRule);
        if (result.ok) {
          savedRef.current = next;
          return;
        }
        revert(result.error);
      } catch {
        revert("Opakovanie sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  function selectMode(mode: Mode): void {
    if (mode === choice.mode) return;
    apply({ ...choice, mode });
  }

  function toggleDay(day: number): void {
    const active = choice.byDay.includes(day);

    /*
      Posledný deň sa odobrať nedá. Týždenné pravidlo bez dní nie je pravidlo:
      `formatRecurrence` z neho spraví „každý deň" a úloha by sa ticho začala
      opakovať denne. Vypnutie opakovania má vlastnú voľbu, nech je zámer jasný.
    */
    if (active && choice.byDay.length === 1) {
      setError(
        "Aspoň jeden deň musí ostať vybraný. Celé opakovanie vypneš voľbou vyššie.",
      );
      return;
    }

    const byDay = active
      ? choice.byDay.filter((value) => value !== day)
      : [...choice.byDay, day].sort((a, b) => a - b);

    apply({ ...choice, byDay });
  }

  const recurrence = toRecurrence(choice);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Štyri voľby v dvoch stĺpcoch: do 375 px sa vedľa seba nezmestia
          tak, aby sa „Neopakuje sa" nezalomilo uprostred slova. */}
      <div
        role="group"
        aria-label="Ako sa úloha opakuje"
        className="grid grid-cols-2 gap-1.5"
      >
        {MODES.map((option) => {
          const active = choice.mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => selectMode(option.value)}
              className={cn(
                "inline-flex min-h-11 min-w-0 items-center justify-center rounded border px-2",
                "text-body font-medium transition-colors duration-100 ease-out md:min-h-9",
                active
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-border bg-surface text-fg-muted hover:border-border-strong",
              )}
            >
              <span className="min-w-0 truncate">{option.label}</span>
            </button>
          );
        })}
      </div>

      {choice.mode === "weekly" ? (
        <div
          role="group"
          aria-label="Dni v týždni"
          className="grid grid-cols-7 gap-1"
        >
          {WEEKDAY_ORDER.map((day) => {
            const active = choice.byDay.includes(day);
            // Celý názov len pre čítačku a bublinu — z dvoch písmen sa nedá
            // uhádnuť, či „So" znamená sobotu alebo niečo iné.
            const full = WEEKDAYS_SK[day];
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                aria-label={full}
                title={full}
                onClick={() => toggleDay(day)}
                className={cn(
                  "inline-flex min-h-11 min-w-0 items-center justify-center rounded border",
                  // Skratky sú v knižnici malými písmenami; veľké začiatočné
                  // písmeno rieši CSS, nech netreba druhú tabuľku názvov.
                  "text-body font-medium capitalize md:min-h-9",
                  "transition-colors duration-100 ease-out",
                  active
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-border bg-surface text-fg-muted hover:border-border-strong",
                )}
              >
                {WEEKDAYS_SHORT_SK[day]}
              </button>
            );
          })}
        </div>
      ) : null}

      {choice.mode === "monthly" ? (
        <Select
          value={String(choice.byMonthDay)}
          onValueChange={(value) => {
            const day = Number(value);
            if (Number.isNaN(day)) return;
            apply({ ...choice, byMonthDay: day });
          }}
        >
          <SelectTrigger aria-label="Deň v mesiaci">
            <SelectValue />
          </SelectTrigger>
          {/* Položky kreslí Radix v portáli — inak než cez triedu na obsahu sa
              k nim nedá dostať a 32 px vysoký riadok je pod dotykovou hranicou. */}
          <SelectContent className="[&_[role=option]]:h-11 md:[&_[role=option]]:h-8">
            {MONTH_DAYS.map((day) => (
              <SelectItem key={day} value={String(day)}>
                {day}. deň v mesiaci
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {/* Ľudský popis pravidla. Skladá ho `describeRecurrence`, aby sa zhodoval
          so všetkým ostatným, čo o opakovaní v appke niekde napíšeme. */}
      <p className="text-meta leading-relaxed text-fg-muted">
        {recurrence === null
          ? "Úloha sa neopakuje — po odškrtnutí nič nové nevznikne."
          : `Opakuje sa ${describeRecurrence(recurrence)}.`}
      </p>

      {/* Bez tejto vety pôsobí 31. v februári ako chyba appky, nie ako zámer. */}
      {choice.mode === "monthly" ? (
        <p className="text-mini leading-relaxed text-fg-subtle">
          Keď mesiac toľko dní nemá — napríklad 31. vo februári — výskyt padne na
          jeho posledný deň, nepreskočí sa.
        </p>
      ) : null}

      {error !== null ? (
        <p role="alert" className="text-mini font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
