import { areaColorValue } from "@/components/task/area-dot";
import { WEEKDAYS_SHORT_SK, formatDayMonthSk } from "@/lib/dates";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   MRIEŽKA NÁVYKU

   Stĺpec = týždeň, riadok = deň v týždni, presne ako príspevkový kalendár na
   GitHube. Vodorovná os je čas, zvislá je deň — vďaka tomu je na prvý pohľad
   vidieť aj to, čo číslo série nepovie: že sa návyk vždy rozsype cez víkend
   alebo že spadol práve v mesiaci, keď bolo v práci najhoršie.

   POLÍČKO JE BINÁRNE. `habit_entries` má na deň jediný záznam s `done`, takže
   deň je splnený alebo nie — nič medzi tým neexistuje. Odtiene ako na GitHube
   (jeden commit svetlo, desať tmavo) by tu boli vymyslené dáta: museli by sme
   si počet „splnení za deň" domyslieť, hoci ho databáza nikdy nedržala. Preto
   sú stavy len tri a všetky vychádzajú z toho, čo naozaj vieme:

     • splnené        — plná farba návyku
     • nesplnené      — prázdne políčko (`bg-surface-2`)
     • ešte nebolo    — deň v budúcnosti, stlmené; nie je to zlyhanie

   Farba sa berie z `habit.color`, aby sa dve mriežky pod sebou nezliali do
   jednej. Nesie príslušnosť, nie intenzitu.

   Mriežka je ZÁMERNE bez kliknutia. Odškrtnúť sa dá len dnešok — dopĺňať si
   spätne políčka znamená písať si históriu podľa toho, ako by sa človek rád
   videl, a séria, ktorá sa dá domaľovať, nemeria nič.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Koľko posledných týždňov ostane viditeľných pod `sm`.
 *
 * Osem stĺpcov po 14 px vrátane medzier a menoviek dní je asi 160 px — na
 * 375 px sa to zmestí aj s odsadením karty a políčko ostane rozoznateľné.
 * Dvanásť by sa síce tiež vošlo, ale za cenu políčok takých malých, že by sa
 * z mriežky stala textúra.
 *
 * Konštanta je spoločná pre mriežku aj popisku pod ňou. Keby si každá držala
 * vlastnú, popiska by po zmene tvrdila iný rozsah, než aký je vidieť.
 */
export const COMPACT_WEEKS = 8;

export interface HabitGridProps {
  /**
   * Týždne zľava (najstarší) doprava (prebiehajúci), každý ako sedem dní
   * počnúc `weekStartsOn`. Skladá ich server — v klientovi by na to bolo
   * treba dnešok, a ten sa tu nesmie zisťovať.
   */
  weeks: readonly (readonly string[])[];
  /** Dni, keď je návyk splnený. */
  done: ReadonlySet<string>;
  /** Názov farby z `habits.color`. */
  color: string;
  /** Dnešok v pásme používateľa — hranica medzi „nesplnené" a „ešte nebolo". */
  todayIso: string;
  /** Prvý deň týždňa z nastavení; určuje, čo je v ktorom riadku. */
  weekStartsOn: number;
  /** Názov návyku do menovky pre čítačku — „mriežka" sama o sebe nič nehovorí. */
  title: string;
  /**
   * Staršie stĺpce sa na telefóne skryjú **triedou, nie výpočtom**: rozdielny
   * počet vykreslených políčok na serveri a v prehliadači by bol rozdielny
   * HTML a hydratácia by sa rozišla.
   */
  compactWeeks?: number;
  className?: string;
}

export function HabitGrid({
  weeks,
  done,
  color,
  todayIso,
  weekStartsOn,
  title,
  compactWeeks = COMPACT_WEEKS,
  className,
}: HabitGridProps) {
  const filled = areaColorValue(color);

  /* Od ktorého stĺpca sa mriežka ukazuje aj na telefóne. */
  const firstCompact = Math.max(0, weeks.length - compactWeeks);

  /* Koľko dní z okna je splnených — číslo pre čítačku, ktorá políčka nevidí. */
  let doneInWindow = 0;
  for (const week of weeks) {
    for (const day of week) if (done.has(day)) doneInWindow += 1;
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {/*
        Celá mriežka je pre čítačku jeden obrázok s vetou namiesto obsahu.
        Osemdesiatštyri políčok by inak prečítala po jednom a z návyku by sa
        stala minúta hlásenia dátumov; číslo série aj plnenie týždňa sú
        v texte nad mriežkou, takže o informáciu nikto nepríde.
      */}
      <div
        role="img"
        aria-label={`Mriežka návyku ${title} — ${weeks.length} týždňov, splnené ${doneInWindow} dní`}
        className="flex min-w-0 items-start gap-1.5"
      >
        {/* Menovky dní. Každý druhý riadok, inak by sa 9px text zlial. */}
        <div aria-hidden="true" className="flex shrink-0 flex-col gap-[3px]">
          {Array.from({ length: 7 }, (_, row) => (
            <span
              key={row}
              className={cn(
                "flex h-3.5 items-center text-[9px] leading-none text-fg-subtle sm:h-3",
                row % 2 === 1 && "invisible",
              )}
            >
              {WEEKDAYS_SHORT_SK[(weekStartsOn + row) % 7] ?? ""}
            </span>
          ))}
        </div>

        <div aria-hidden="true" className="flex gap-[3px]">
          {weeks.map((week, index) => (
            <div
              key={week[0] ?? index}
              className={cn(
                "flex-col gap-[3px]",
                index < firstCompact ? "hidden sm:flex" : "flex",
              )}
            >
              {week.map((day) => {
                const isDone = done.has(day);
                const isFuture = day > todayIso;

                return (
                  <span
                    key={day}
                    title={`${formatDayMonthSk(day)} — ${
                      isFuture ? "ešte nebolo" : isDone ? "splnené" : "nesplnené"
                    }`}
                    /*
                      Dotykové ciele sa tu neuplatňujú — políčko nie je ovládací
                      prvok. Na telefóne je aj tak väčšie ako na monitore: 14 px
                      je najmenej, čo sa dá na dĺžku ruky ešte rozoznať.
                    */
                    className={cn(
                      "size-3.5 rounded-[3px] sm:size-3",
                      isDone
                        ? ""
                        : isFuture
                          ? "bg-surface-2/50"
                          : "bg-surface-2",
                      day === todayIso && "ring-1 ring-border-strong",
                    )}
                    style={isDone ? { backgroundColor: filled } : undefined}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Popiska pod mriežkou — od kedy sa pozeráme.
 *
 * Je to vlastný komponent, lebo rozsah je na telefóne iný než na monitore
 * (skrytých stĺpcov si popiska musí všimnúť) a karta si k nemu ešte pridáva
 * najdlhšiu sériu. Držať to v jednom riadku s mriežkou by z nej spravilo
 * komponent o dvoch nesúvisiacich veciach.
 */
export function HabitGridCaption({
  weeks,
  compactWeeks = COMPACT_WEEKS,
  extra,
}: {
  weeks: readonly (readonly string[])[];
  compactWeeks?: number;
  extra?: string;
}) {
  const firstCompact = Math.max(0, weeks.length - compactWeeks);
  const fullStart = weeks[0]?.[0];
  const compactStart = weeks[firstCompact]?.[0];
  const suffix = extra === undefined ? "" : ` · ${extra}`;

  return (
    <p className="min-w-0 truncate text-[10px] leading-none text-fg-subtle">
      <span className="sm:hidden">
        {compactStart === undefined
          ? `posledné týždne${suffix}`
          : `od ${formatDayMonthSk(compactStart)} po dnes${suffix}`}
      </span>
      <span className="hidden sm:inline">
        {fullStart === undefined
          ? `posledné týždne${suffix}`
          : `od ${formatDayMonthSk(fullStart)} po dnes${suffix}`}
      </span>
    </p>
  );
}
