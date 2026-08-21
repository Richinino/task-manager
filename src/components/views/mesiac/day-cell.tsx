import type { UrlObject } from "url";

import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { AddTaskPopover } from "@/components/task/add-task-inline";
import { PriorityDot } from "@/components/task/priority-dot";
import { MONTHS_SHORT_SK, formatLongSk, parseIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/*
  Tento modul musí ostať bez hookov a bez direktívy "use client": berie si ho
  serverová mriežka aj serverová stránka `mesiac/page.tsx` (kvôli typu
  `DayEntry`). Keby tu bol `useState`, build spadne. Interaktívnu časť
  (pridávanie úlohy) bunka len vkladá — celý stav si nesie `AddTaskPopover`.

  ─────────────────────────────────────────────────────────────────────────────
  DVE ROZLOŽENIA, JEDEN ZDROJ DÁT

  Sedem stĺpcov na telefóne znamená ~47 px na deň. Do takej bunky sa názov úlohy
  nezmestí nikdy — orezaním by z neho ostal jeden znak s výpustkou. Preto sa pod
  `md` nemení VEĽKOSŤ, ale OBSAH:

    • telefón (do 768 px) → číslo dňa + kompaktný signál (koľko termínov,
      koľko plánov). Ťuknutie rozbalí zoznam úloh dňa pod mriežkou.
    • od `md`                → pôvodné riadky s názvami úloh a odkaz na týždeň.
      Tam je bunka ~90 px a viac, takže názov má zmysel.

  Bunka dostáva VŠETKY záznamy dňa a orezanie na `MAX_ENTRIES_PER_DAY` si robí
  sama — signál pre telefón musí počítať z úplného zoznamu, inak by „+3" a „3"
  hovorili to isté číslo pri piatich úlohách.
*/

/** Koľko úloh sa od `md` do bunky zmestí, kým sa zvyšok schová za „+ ďalšie N". */
export const MAX_ENTRIES_PER_DAY = 3;

/**
 * Prečo je úloha v tento deň vidieť.
 *
 * `due` = dokedy MUSÍ byť hotová, `planned` = ktorý deň to IDEM ROBIŤ.
 * Tento rozdiel je jadro celého systému, takže sa kreslí, nie iba ukladá.
 */
export type DayEntryKind = "due" | "planned";

export interface DayEntry {
  /** Stabilný kľúč pre React — jedna úloha môže byť v mriežke dvakrát. */
  key: string;
  title: string;
  kind: DayEntryKind;
  priority: number;
  /** `done` alebo `dropped` — úloha už nič nepýta. */
  done: boolean;
  /** Termín v minulosti a úloha ešte nie je vybavená. */
  overdue: boolean;
}

export interface DayCellProps {
  iso: string;
  /** Patrí deň do zobrazeného mesiaca, alebo len dobieha zo susedného? */
  inMonth: boolean;
  isToday: boolean;
  /** Je tento deň práve rozbalený pod mriežkou? (iba telefón) */
  isSelected: boolean;
  /** VŠETKY záznamy dňa, už zoradené. Orezanie si robí bunka. */
  entries: DayEntry[];
  /**
   * Od `md` — týždeň, do ktorého deň patrí.
   * Objektový tvar, lebo `typedRoutes` neprijme zloženú adresu ako `string`.
   */
  weekHref: UrlObject;
  /** Telefón — rozbalí zoznam úloh dňa pod mriežkou (alebo ho zavrie). */
  dayHref: UrlObject;
}

/** „+ ďalšia 1" / „+ ďalšie 4" / „+ ďalších 7" — slovenské skloňovanie. */
function moreLabel(count: number): string {
  if (count === 1) return "+ ďalšia 1";
  if (count < 5) return `+ ďalšie ${count}`;
  return `+ ďalších ${count}`;
}

/**
 * Značka termínu: TROJUHOLNÍK.
 *
 * Rozdiel medzi termínom a plánom nesmie stáť na farbe — pri deuteranopii je
 * červená proti sivej takmer nerozlíšiteľná. Trojuholník proti kruhu
 * (`PriorityDot`) drží aj v čiernobielom a aj pri 8 px, kde by sa ikona hodín
 * zlepila do škvrny.
 *
 * `quiet` = všetky termíny dňa sú vybavené; signál má stíchnuť, nie zmiznúť.
 */
export function DueMark({ quiet = false, className }: { quiet?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 [clip-path:polygon(50%_0%,100%_100%,0%_100%)]",
        quiet ? "bg-fg-subtle" : "bg-danger",
        className,
      )}
    />
  );
}

interface DaySummary {
  dueCount: number;
  /** Nevybavené termíny — 0 znamená, že signál termínu môže stíchnuť. */
  dueOpen: number;
  plannedCount: number;
  plannedOpen: number;
  /** Najvyššia priorita medzi nevybavenými plánmi — farba a tvar bodky. */
  plannedPriority: number;
}

/** Jeden prechod cez záznamy; z neho žije celý signál na telefóne. */
function summarize(entries: DayEntry[]): DaySummary {
  let dueCount = 0;
  let dueOpen = 0;
  let plannedCount = 0;
  let plannedOpen = 0;
  let plannedPriority = 3;

  for (const entry of entries) {
    if (entry.kind === "due") {
      dueCount += 1;
      if (!entry.done) dueOpen += 1;
      continue;
    }

    plannedCount += 1;
    if (entry.done) continue;
    plannedOpen += 1;
    if (entry.priority < plannedPriority) plannedPriority = entry.priority;
  }

  return { dueCount, dueOpen, plannedCount, plannedOpen, plannedPriority };
}

/** „termín, po termíne: Zaplatiť daň, vybavené." — jedna veta na jeden záznam. */
function entryPhrase(entry: DayEntry): string {
  const kind =
    entry.kind === "due" ? (entry.overdue ? "termín, po termíne" : "termín") : "naplánované";
  return `${kind}: ${entry.title}${entry.done ? ", vybavené" : ""}.`;
}

/**
 * Prístupný popis celej bunky.
 *
 * Kreslená časť bunky je `aria-hidden` a všetok obsah nesie NÁZOV ODKAZU —
 * inak by čítačka v mriežke 42 rovnakých odkazov čítala len „Otvoriť týždeň".
 * Na telefóne tak čítačka dostane aj názvy úloh, hoci oko vidí len bodky.
 */
function describeDay(iso: string, entries: DayEntry[]): string {
  const shown = entries.slice(0, MAX_ENTRIES_PER_DAY);
  const hidden = entries.length - shown.length;

  const parts = [`${formatLongSk(iso)}.`, ...shown.map(entryPhrase)];
  if (hidden > 0) parts.push(`${moreLabel(hidden)}.`);
  return parts.join(" ");
}

/**
 * Riadok úlohy v bunke — iba od `md`. Termín má výraznejšiu kresbu (ľavý pruh,
 * plné pozadie, polotučné písmo, ikona hodín), plán je tichý (jemné pozadie,
 * bodka priority). Rozdiel nesie tvar, nielen farba.
 *
 * `min-w-0` na názve je tu povinné: bez neho sa pružná položka odmieta zmenšiť
 * pod šírku svojho obsahu a dlhý názov by roztiahol celý stĺpec mriežky.
 */
function DayEntryChip({ entry }: { entry: DayEntry }) {
  const isDue = entry.kind === "due";
  const kindLabel = isDue ? (entry.overdue ? "termín, po termíne" : "termín") : "naplánované";

  return (
    <span
      title={`${kindLabel}: ${entry.title}`}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded px-1 py-px text-mini leading-tight",
        isDue
          ? "border-l-2 border-danger bg-danger/10 font-semibold text-fg"
          : "bg-surface-2 font-normal text-fg-muted",
        isDue && entry.overdue && "text-danger",
        entry.done && "font-normal text-fg-subtle line-through",
      )}
    >
      {isDue ? (
        <CalendarClock size={11} className="shrink-0 text-danger" />
      ) : (
        <PriorityDot priority={entry.priority} size="sm" />
      )}

      <span className="min-w-0 truncate">{entry.title}</span>
    </span>
  );
}

/**
 * Jeden deň mriežky.
 *
 * Odkaz je ZÁMERNE prekryv cez celú bunku, nie obal jej obsahu: bunka má dva
 * rôzne ciele podľa šírky okna (telefón → rozbalenie dňa, `md` → týždeň) a dva
 * prekryvné odkazy sa dajú prepnúť triedou `hidden`. `display: none` vyradí
 * odkaz aj z poradia tabov aj zo stromu prístupnosti, takže tab-stop ostáva
 * vždy práve jeden — nie dva. Obsah bunky sa pritom kreslí len raz.
 *
 * Tlačidlo „+" je súrodenec odkazu, nie jeho potomok: tlačidlo vnútri odkazu je
 * neplatné HTML a čítačky sa v ňom správajú rôzne.
 */
export function DayCell({
  iso,
  inMonth,
  isToday,
  isSelected,
  entries,
  weekHref,
  dayHref,
}: DayCellProps) {
  const date = parseIsoDate(iso);
  const dayNumber = date.getDate();
  // Prvý deň dobiehajúceho mesiaca si pýta menovku, inak sa čísla zlievajú.
  const monthHint = !inMonth && dayNumber === 1 ? MONTHS_SHORT_SK[date.getMonth()] : undefined;

  const shown = entries.slice(0, MAX_ENTRIES_PER_DAY);
  const hiddenCount = entries.length - shown.length;
  const summary = summarize(entries);
  const description = describeDay(iso, entries);

  return (
    <div
      className={cn(
        "relative min-w-0 rounded border bg-surface",
        "transition-colors duration-100 ease-out",
        inMonth
          ? "border-border hover:border-border-strong hover:bg-surface-2"
          : "border-border/60 opacity-50 hover:opacity-90",
        isToday && "border-accent bg-accent-soft/40 hover:border-accent",
        // Rozbalený deň je vyznačený prstencom — na `md` panel neexistuje, teda ani prstenec.
        isSelected && "border-accent ring-2 ring-accent md:ring-0",
      )}
    >
      {/*
        Kreslená časť je celá `aria-hidden` — všetko, čo je v nej vidieť, nesie
        názov prekryvného odkazu. Nie je v nej nič zaostriteľné.

        Výška: 56 px na telefóne je pohodlný dotykový cieľ (WCAG 2.2 SC 2.5.8
        pýta 24, palec chce 44) a zároveň sa celý mesiac zmestí na jednu
        obrazovku — čo je zmysel mesačného pohľadu. Od `md` ostáva pôvodných 96.
      */}
      <div
        aria-hidden="true"
        className={cn(
          "flex h-full min-h-14 min-w-0 flex-col gap-1 overflow-hidden p-1",
          "md:min-h-24 md:p-1.5",
        )}
      >
        {/* `md:pr-5` drží číslo mimo rohu, kde od `md` sedí „+". */}
        <span className="flex items-baseline justify-between gap-1 md:pr-5">
          <span
            className={cn(
              "font-mono tabular-nums",
              isToday
                ? "inline-flex size-5 items-center justify-center rounded-full bg-accent text-mini font-semibold text-accent-fg"
                : cn("text-meta font-semibold", inMonth ? "text-fg" : "text-fg-subtle"),
            )}
          >
            {dayNumber}
          </span>
          {monthHint ? (
            <span className="truncate text-micro text-fg-subtle">{monthHint}</span>
          ) : null}
        </span>

        {/*
          TELEFÓN — kompaktný signál.

          Tvar hovorí ČO (trojuholník = termín, kruh = plán), číslo hovorí
          KOĽKO. Číslo sa píše až od dvoch, aby bežný deň s jednou úlohou
          ostal čistý. Dva signály + dve čísla majú ~34 px, čo sa do 47 px
          bunky zmestí bez zalomenia.
        */}
        {summary.dueCount > 0 || summary.plannedCount > 0 ? (
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 md:hidden">
            {summary.dueCount > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <DueMark quiet={summary.dueOpen === 0} />
                {summary.dueCount > 1 ? (
                  <span
                    className={cn(
                      "text-micro font-semibold leading-none font-mono tabular-nums",
                      summary.dueOpen === 0 ? "text-fg-subtle" : "text-danger",
                    )}
                  >
                    {summary.dueCount}
                  </span>
                ) : null}
              </span>
            ) : null}

            {summary.plannedCount > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <PriorityDot
                  priority={summary.plannedPriority}
                  size="sm"
                  className={summary.plannedOpen === 0 ? "opacity-40" : undefined}
                />
                {summary.plannedCount > 1 ? (
                  <span className="text-micro leading-none font-mono tabular-nums text-fg-muted">
                    {summary.plannedCount}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        ) : null}

        {/* OD `md` — pôvodné riadky s názvami úloh. */}
        {shown.length > 0 ? (
          <span className="hidden min-w-0 flex-col items-stretch gap-0.5 md:flex">
            {shown.map((entry) => (
              <DayEntryChip key={entry.key} entry={entry} />
            ))}
            {hiddenCount > 0 ? (
              <span className="px-1 text-micro font-medium leading-tight text-fg-subtle">
                {moreLabel(hiddenCount)}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {/*
        TELEFÓN — deň sa rozbalí pod mriežkou, mesiac ostáva na obrazovke.
        Opätovné ťuknutie ho zavrie; vtedy sa nesmie skrolovať (`scroll={false}`),
        lebo by stránka skočila hore a používateľ by stratil miesto v mriežke.
        Pri otváraní naopak `dayHref` nesie kotvu na panel, takže Next doň skočí.
      */}
      <Link
        href={dayHref}
        scroll={!isSelected}
        aria-current={isSelected ? "true" : undefined}
        className="absolute inset-0 rounded md:hidden"
      >
        <span className="sr-only">
          {description} {isSelected ? "Zavrieť zoznam úloh dňa." : "Otvoriť zoznam úloh dňa."}
        </span>
      </Link>

      {/* OD `md` — bunka vedie na týždeň, presne ako doteraz. */}
      <Link href={weekHref} className="absolute inset-0 hidden rounded md:block">
        <span className="sr-only">{description} Otvoriť týždeň.</span>
      </Link>

      {/*
        „+" ostáva len od `md`. Na telefóne by to bol 24 px cieľ v rohu 47 px
        bunky — polovica ťuknutí na deň by namiesto zoznamu otvorila bublinu.
        Pridávanie na deň sa tam nestráca: rovnaké tlačidlo je v rozbalenom
        paneli dňa, tam s plnou 44 px plochou.
      */}
      <AddTaskPopover
        date={iso}
        size="sm"
        className="absolute right-0.5 top-0.5 z-10 hidden md:inline-flex"
      />
    </div>
  );
}
