"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  archivHref,
  DEFAULT_ARCHIVE_FILTER,
  type ArchiveFilterValue,
} from "./archive-filters";

/* ═══════════════════════════════════════════════════════════════════════════
   POLE HĽADANIA

   Pravdou je adresa, nie stav komponentu. Pole si drží rozpísaný text len
   preto, aby písanie neblikalo; hneď ako sa človek na chvíľu odmlčí, prepíše
   sa `?q=` a výsledky prídu zo servera.

   Formulár je obyčajný `GET` na `/archiv`. Bez JavaScriptu je to celé hotové
   hľadanie — Enter načíta stránku s parametrom v adrese. S JavaScriptom sa to
   isté deje len skôr a bez načítania celej stránky.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Koľko sa čaká po poslednom písmene, kým sa prepíše adresa.
 *
 * Pri každom znaku by to bol dotaz do databázy na každé stlačenie klávesy;
 * pri sekunde by človek stihol nadobudnúť dojem, že sa nič nedeje.
 */
const DEBOUNCE_MS = 250;

export interface SearchFieldProps {
  /** Dopyt z adresy — jediný zdroj pravdy. */
  query: string;
  /** Otvorená priehradka archívu. Písaním sa nesmie stratiť. */
  filter: ArchiveFilterValue;
}

export function SearchField({ query, filter }: SearchFieldProps) {
  const router = useRouter();
  const [value, setValue] = useState(query);
  const [pending, startTransition] = useTransition();

  /*
    Posledný text, ktorý do adresy zapísal tento komponent.

    Slúži na dve veci naraz: nezapisovať to isté druhý raz a spoznať zmenu,
    ktorá prišla zvonku — tlačidlo späť alebo otvorený zdieľaný odkaz. Vtedy
    sa `query` rozíde s tým, čo sme zapísali my, a pole sa má prepísať podľa
    adresy, nie naopak.
  */
  const written = useRef(query);

  useEffect(() => {
    if (query === written.current) return;
    written.current = query;
    setValue(query);
  }, [query]);

  const go = useCallback(
    (next: string) => {
      written.current = next;
      /*
        `replace`, nie `push`: každé písmeno by inak nechalo v histórii vlastný
        záznam a jedno stlačenie „späť" by sa vrátilo o jeden znak namiesto na
        predchádzajúcu obrazovku. Adresa je aj tak vždy aktuálna, takže sa dá
        poslať aj uložiť do záložiek.
      */
      startTransition(() => router.replace(archivHref(next, filter)));
    },
    [filter, router],
  );

  /* Odpočet po poslednom písmene. Ďalší znak ho zruší a spustí odznova. */
  useEffect(() => {
    if (value === written.current) return;
    const timer = window.setTimeout(() => go(value), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [go, value]);

  const trimmed = value.trim();

  /*
    Jedna riadková rada pod poľom. Vysvetliť, prečo jedno písmeno nič nevráti,
    je lacnejšie než nechať človeka hádať, či je appka pokazená.
  */
  const hint = pending
    ? "Hľadám…"
    : trimmed.length === 1
      ? "Napíš aspoň dve písmená — jedno by vrátilo skoro všetko."
      : trimmed !== ""
        ? "Na diakritike nezáleží — stvrtok nájde aj štvrtok."
        : "Hľadá aj v uzavretých a zmazaných veciach — práve tie sa hľadajú najčastejšie.";

  return (
    <form
      action="/archiv"
      method="get"
      role="search"
      onSubmit={(event) => {
        // So zapnutým JavaScriptom netreba načítavať celú stránku — Enter len
        // predbehne odpočet a prepíše adresu hneď.
        event.preventDefault();
        go(value);
      }}
      className="flex min-w-0 flex-col gap-1.5"
    >
      {/* Bez JavaScriptu odošle formulár len to, čo v ňom je — priehradka
          archívu by sa odoslaním stratila. */}
      {filter === DEFAULT_ARCHIVE_FILTER ? null : (
        <input type="hidden" name="druh" value={filter} />
      )}

      <div className="relative min-w-0">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
        />

        <Input
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          aria-label="Hľadať naprieč appkou"
          placeholder="Hľadaj v úlohách, nápadoch, projektoch…"
          className={cn(
            "h-11 pl-9 text-base sm:h-9 sm:text-sm",
            // Miesto pre vlastné tlačidlo na vymazanie vpravo.
            "pr-11 sm:pr-9",
            // WebKit kreslí do `type="search"` svoj vlastný krížik; dva vedľa
            // seba by boli len mätúce.
            "[&::-webkit-search-cancel-button]:hidden",
          )}
        />

        {value === "" ? null : (
          <button
            type="button"
            onClick={() => {
              setValue("");
              go("");
            }}
            aria-label="Vymazať hľadanie"
            className={cn(
              "absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded sm:size-7",
              "text-fg-subtle transition-colors duration-100 ease-out",
              "hover:bg-surface-2 hover:text-fg",
            )}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>

      {/* Pevná výška: rada sa mení pri písaní a poskakujúci obsah pod poľom
          by tlačil zoznam výsledkov hore-dole. */}
      <p aria-live="polite" className="min-h-4 text-[11px] leading-4 text-fg-subtle">
        {hint}
      </p>
    </form>
  );
}
