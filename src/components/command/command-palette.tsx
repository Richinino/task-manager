"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "cmdk";
import {
  Circle,
  CircleCheck,
  FolderPlus,
  Layers,
  Plus,
  Search,
  SunMoon,
} from "lucide-react";

import { NAV_ITEMS } from "@/components/shell/sidebar";
import { toggleTheme } from "@/components/shell/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { addDays, formatRelativeSk, startOfWeek, today } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Paleta príkazov (Ctrl+K / Cmd+K).
 *
 * Skupiny: Navigácia · Akcie · Úlohy. Úlohy prichádzajú ako prop zhora
 * (`CaptureProvider` ich dostáva z layoutu) — paleta nič nedotahuje zo servera,
 * filtruje si ich sama podľa názvu, bez ohľadu na diakritiku.
 */

/**
 * Next 16 má zapnuté `typedRoutes` a od `router.push` čaká literál cesty.
 * Naše cesty vznikajú až za behu (z `NAV_ITEMS` a z dátumu úlohy), preto jedno
 * pretypovanie — odvodené priamo od routera, aby prežilo aj zmenu jeho typov.
 */
type RouterHref = Parameters<ReturnType<typeof useRouter>["push"]>[0];

/** Úloha tak, ako ju paleta potrebuje — nič viac. */
export interface CommandTask {
  id: string;
  title: string;
  /** `YYYY-MM-DD` alebo `null`, keď úloha nemá deň. */
  plannedDate: string | null;
  /** Nezatriedená úloha — patrí do inboxu. */
  inbox: boolean;
  /** Uzavretá úloha (hotová alebo zahodená) — v zozname je stlmená. */
  done: boolean;
  projectName: string | null;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: readonly CommandTask[];
  /** Otvorí rýchle zachytenie. Zatvorenie palety si rieši volajúci. */
  onCreateTask: () => void;
  /** Prvý deň týždňa — podľa neho sa rozhoduje, či úloha patrí do týždňa. */
  weekStartsOn?: number;
}

/* ═══════════════════════════════════════════════════════════════════════════
   HĽADANIE

   Vlastný filter namiesto predvoleného z cmdk, lebo ten neznáša diakritiku:
   „tyzden" musí nájsť „Týždeň". Tu sa dĺžka reťazca meniť smie (na rozdiel od
   parsera), takže stačí obyčajné NFD a zahodenie diakritických znamienok.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Rozsah kombinovateľných diakritických znamienok, ktoré NFD odlepí od písmena. */
const COMBINING_MARKS = /[\u0300-\u036f]/gu;

function fold(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

/** Sú písmená hľadaného výrazu v texte v správnom poradí? (Tolerancia preklepov.) */
function isSubsequence(needle: string, haystack: string): boolean {
  if (needle === "") return true;
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

/** Prefix hodnoty položky s úlohou — podľa neho filter pozná, že už je vyfiltrovaná. */
const TASK_VALUE_PREFIX = "uloha:";

function commandFilter(value: string, search: string, keywords?: string[]): number {
  // Úlohy si preosievame sami nižšie — cmdk ich už nemá čo zahadzovať.
  if (value.startsWith(TASK_VALUE_PREFIX)) return 1;

  const needle = fold(search.trim());
  if (needle === "") return 1;

  const haystack = fold((keywords ?? [value]).join(" "));
  const index = haystack.indexOf(needle);
  if (index === 0) return 1;
  if (index > 0) return 0.8;
  return isSubsequence(needle, haystack) ? 0.4 : 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
   POMOCNÍCI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Kam skočiť po výbere úlohy. Detail úlohy ešte nemá vlastnú adresu, takže
 * ideme na obrazovku, kde je úloha vidieť.
 */
function hrefForTask(task: CommandTask, weekStartsOn: number): string {
  if (task.plannedDate === null) return task.inbox ? "/inbox" : "/mesiac";

  const todayIso = today();
  // Prepadnuté úlohy sa zobrazujú na Dnes, preto sem patrí aj minulosť.
  if (task.plannedDate <= todayIso) return "/dnes";

  const weekEnd = addDays(startOfWeek(todayIso, weekStartsOn), 6);
  return task.plannedDate <= weekEnd ? "/tyzden" : "/mesiac";
}

/** Pravý stĺpček riadku úlohy — čo najužitočnejšia jedna informácia. */
function taskHint(task: CommandTask): string {
  if (task.projectName !== null) return task.projectName;
  if (task.plannedDate !== null) return formatRelativeSk(task.plannedDate);
  return task.inbox ? "inbox" : "niekedy";
}

/* ═══════════════════════════════════════════════════════════════════════════
   ŠTÝLY
   ═══════════════════════════════════════════════════════════════════════════ */

const ITEM_CLASS = cn(
  "flex cursor-pointer select-none items-center gap-2.5 rounded px-2 py-1.5",
  // Pod `sm` je riadok plnohodnotný dotykový cieľ; od `sm` ostáva hustý zoznam.
  "min-h-11 sm:min-h-0",
  "text-body text-fg-muted outline-none",
  "data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent",
  "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-45",
);

const HEADING_CLASS = cn(
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2",
  "[&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:font-semibold",
  "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider",
  "[&_[cmdk-group-heading]]:text-fg-subtle",
);

/* ═══════════════════════════════════════════════════════════════════════════
   KOMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export function CommandPalette({
  open,
  onOpenChange,
  tasks,
  onCreateTask,
  weekStartsOn = 1,
}: CommandPaletteProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  // Zatvorená paleta si nepamätá, čo sa v nej hľadalo.
  useEffect(() => {
    // Preverená výnimka: beží len pri zatvorení, teda raz. Zavrieť sa dá aj
    // zvonku (skratkou, po navigácii), takže vynulovanie v `onOpenChange`
    // by časť prípadov minulo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!open) setSearch("");
  }, [open]);

  // Úlohy sa ponúkajú až po napísaní hľadaného výrazu — inak by zoznam prehlušil príkazy.
  const matchedTasks = useMemo<CommandTask[]>(() => {
    const needle = fold(search.trim());
    if (needle === "") return [];
    return tasks
      .filter((task) => {
        if (fold(task.title).includes(needle)) return true;
        return task.projectName !== null && fold(task.projectName).includes(needle);
      })
      .slice(0, 8);
  }, [search, tasks]);

  function runAndClose(action: () => void): void {
    onOpenChange(false);
    action();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Paletu ZÁMERNE neskrývame pod `sm`.

        Body zlomu merajú šírku okna, nie zariadenie — `sm:hidden` by ju
        vypol aj v zúženom okne na počítači, kde je klávesnica po ruke a
        Ctrl+K je najrýchlejšia cesta cez celú appku. To je presne tá chyba,
        ktorej má rozhodovanie podľa šírky predchádzať.

        Na telefóne paleta aj tak nikomu neprekáža: otvára ju iba Ctrl+K,
        plávajúce tlačidlo otvára rýchle zachytenie, takže bez pripojenej
        klávesnice sa na ňu nedá ani natrafiť. Skrytie by teda na telefóne
        neodobralo nič a inde by odobralo veľa. Namiesto toho je paleta
        použiteľná aj v úzkom okne: riadky majú 44 px, klávesová pätička
        (šípky, Enter, Esc) je pod `sm` skrytá a okno sedí hore, aby ho
        nezakryla vysunutá klávesnica.
      */}
      <DialogContent
        showClose={false}
        className="mt-3 max-w-xl overflow-hidden p-0 sm:mt-[12vh]"
      >
        <DialogTitle className="sr-only">Paleta príkazov</DialogTitle>
        <DialogDescription className="sr-only">
          Píš a vyberaj šípkami hore a dole. Enter potvrdí, Escape zavrie.
        </DialogDescription>

        <Command
          label="Paleta príkazov"
          filter={commandFilter}
          loop
          className={cn("flex flex-col", HEADING_CLASS)}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Hľadaj úlohu alebo príkaz…"
              className={cn(
                // 16 px písmo pod `sm` — menšie si mobilný prehliadač pri
                // fokuse priblíži a stránka ostane zväčšená.
                "h-11 w-full min-w-0 bg-transparent text-base text-fg sm:text-sm",
                "placeholder:text-fg-subtle",
              )}
            />
          </div>

          {/* Pod `sm` nižší strop: nad zoznamom má ostať miesto na klávesnicu. */}
          <CommandList className="max-h-[min(45vh,24rem)] overflow-y-auto overscroll-contain p-1.5 sm:max-h-[min(60vh,24rem)]">
            <CommandEmpty className="px-2 py-6 text-center text-body text-fg-muted">
              Nič sa nenašlo.
            </CommandEmpty>

            <CommandGroup heading="Navigácia">
              {NAV_ITEMS.map(({ href, label, shortcut, Icon }) => (
                <CommandItem
                  key={href}
                  value={`navigacia:${href}`}
                  keywords={[label, href.replace("/", "")]}
                  onSelect={() => runAndClose(() => router.push(href as RouterHref))}
                  className={ITEM_CLASS}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {/* Skratka bez klávesnice nič nehovorí — a zbytočne berie šírku. */}
                  <span className="hidden shrink-0 sm:inline-flex">
                    <Kbd>{shortcut}</Kbd>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="Akcie">
              <CommandItem
                value="akcia:nova-uloha"
                keywords={["Nová úloha", "pridať", "zachytiť", "capture"]}
                onSelect={() => runAndClose(onCreateTask)}
                className={ITEM_CLASS}
              >
                <Plus aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">Nová úloha</span>
                <span className="hidden shrink-0 sm:inline-flex">
                  <Kbd>n</Kbd>
                </span>
              </CommandItem>

              {/*
                Zakladanie projektu a oblasti je paleta, nie vlastný dialóg.

                Formuláre už existujú a sú prvým prvkom na `/projekty`
                a `/oblasti` — chýbala len cesta k nim. Na telefóne sú obe
                obrazovky až za „Viac", takže sa človek pýtal „ako vytvorím
                oblasť?", hoci formulár je hneď navrchu. Skopírovať ho do
                dialógu by znamenalo dve miesta, ktoré sa raz rozídu.
              */}
              <CommandItem
                value="akcia:novy-projekt"
                keywords={[
                  "Nový projekt",
                  "založiť projekt",
                  "vytvoriť projekt",
                  "project",
                ]}
                onSelect={() => runAndClose(() => router.push("/projekty"))}
                className={ITEM_CLASS}
              >
                <FolderPlus aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">Nový projekt…</span>
              </CommandItem>

              <CommandItem
                value="akcia:nova-oblast"
                keywords={[
                  "Nová oblasť",
                  "založiť oblasť",
                  "vytvoriť oblasť",
                  "area",
                ]}
                onSelect={() => runAndClose(() => router.push("/oblasti"))}
                className={ITEM_CLASS}
              >
                <Layers aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">Nová oblasť…</span>
              </CommandItem>

              <CommandItem
                value="akcia:prepnut-temu"
                keywords={["Prepnúť tému", "svetlá", "tmavá", "theme", "dark", "light"]}
                onSelect={() => runAndClose(toggleTheme)}
                className={ITEM_CLASS}
              >
                <SunMoon aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">Prepnúť tému</span>
              </CommandItem>
            </CommandGroup>

            {matchedTasks.length > 0 ? (
              <CommandGroup heading="Úlohy">
                {matchedTasks.map((task) => {
                  const Icon = task.done ? CircleCheck : Circle;
                  return (
                    <CommandItem
                      key={task.id}
                      value={`${TASK_VALUE_PREFIX}${task.id}`}
                      onSelect={() =>
                        runAndClose(() =>
                          router.push(hrefForTask(task, weekStartsOn) as RouterHref),
                        )
                      }
                      className={ITEM_CLASS}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn("size-4 shrink-0", task.done && "opacity-45")}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          task.done && "text-fg-subtle line-through",
                        )}
                      >
                        {task.title}
                      </span>
                      <span className="max-w-32 shrink-0 truncate text-mini text-fg-subtle">
                        {taskHint(task)}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>

          {/* Pätička hovorí len o klávesoch — bez klávesnice je to riadok navyše. */}
          <div
            aria-hidden="true"
            className={cn(
              "hidden flex-wrap items-center gap-x-3 gap-y-1 border-t border-border sm:flex",
              "bg-surface-2 px-3 py-2 text-mini text-fg-subtle",
            )}
          >
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> výber
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>↵</Kbd> potvrdiť
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>Esc</Kbd> zavrieť
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
