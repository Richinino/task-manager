"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Formát musí sedieť s inicializačným skriptom v src/app/layout.tsx. */
export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

const OPTIONS: { value: Theme; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Svetlá téma", Icon: Sun },
  { value: "dark", label: "Tmavá téma", Icon: Moon },
  { value: "system", label: "Podľa systému", Icon: Monitor },
];

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Záloha pre súkromný režim, kde sa do localStorage zapísať nedá. */
let memoryTheme: Theme | null = null;

function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Súkromný režim alebo zakázané úložisko — voľba vydrží do konca relácie.
  }
  return memoryTheme ?? "system";
}

function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZDROJ PRAVDY

   Tému mení prepínač v paneli aj Ctrl+K paleta. Kým mal každý vlastnú kópiu
   logiky, prepínač po zmene z palety ukazoval starú voľbu — vrátane
   `aria-checked`, takže čítačka ohlásila nepravdu. Preto jeden modulový
   sklad nad localStorage a `useSyncExternalStore` nad ním: kto tému zmení,
   ohlási to všetkým, ktorí ju zobrazujú.
   ═══════════════════════════════════════════════════════════════════════════ */

let cachedTheme: Theme | null = null;
const themeListeners = new Set<() => void>();

function notifyThemeChanged(): void {
  cachedTheme = null;
  for (const listener of themeListeners) listener();
}

/** Zmena témy v inej karte toho istého pôvodu platí aj tu. */
function handleStorage(event: StorageEvent): void {
  // `key === null` znamená `localStorage.clear()`.
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  applyTheme(readStoredTheme());
  notifyThemeChanged();
}

function subscribeTheme(onStoreChange: () => void): () => void {
  if (themeListeners.size === 0) window.addEventListener("storage", handleStorage);
  themeListeners.add(onStoreChange);
  return () => {
    themeListeners.delete(onStoreChange);
    if (themeListeners.size === 0) {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

function getThemeSnapshot(): Theme {
  // Snapshot musí byť medzi zmenami referenčne stabilný, preto medzipamäť.
  if (cachedTheme === null) cachedTheme = readStoredTheme();
  return cachedTheme;
}

/**
 * Na serveri (a počas hydratácie) nevieme, čo je v localStorage. `null`
 * znamená „zatiaľ nič nezvýrazňuj" — React po hydratácii sám prekreslí
 * na skutočnú hodnotu, takže sa značky nerozídu.
 */
function getThemeServerSnapshot(): Theme | null {
  return null;
}

/** Aktuálna voľba témy; `null`, kým sa komponent nepripojí v prehliadači. */
export function useTheme(): Theme | null {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot);
}

/** Nastaví tému a ohlási to všetkým, ktorí ju zobrazujú. */
export function setTheme(next: Theme): void {
  memoryTheme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Nevadí — téma bude platiť aspoň do konca relácie.
  }
  applyTheme(next);
  notifyThemeChanged();
}

/**
 * Prepne svetlú ↔ tmavú podľa toho, čo je práve vidieť. Používa ju paleta
 * príkazov — nie vlastnou implementáciou, aby prepínač v paneli ostal presný.
 */
export function toggleTheme(): void {
  const current = getThemeSnapshot();
  const dark = current === "dark" || (current === "system" && prefersDark());
  setTheme(dark ? "light" : "dark");
}

/**
 * Prepínač témy. Trvalý stav je v localStorage pod kľúčom "theme";
 * prvotné nastavenie triedy `.dark` rieši skript v koreňovom layoute,
 * tu ho už len udržiavame.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // Pred pripojením nevieme, čo je v localStorage — nič nezvýrazňujeme,
  // aby sa server a klient nerozišli pri hydratácii.
  const theme = useTheme();

  // Pri voľbe „podľa systému" musíme reagovať na zmenu systémového nastavenia.
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  return (
    <div
      role="radiogroup"
      aria-label="Téma"
      className={cn(
        "inline-flex items-center gap-0.5 rounded border border-border bg-surface-2 p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              // Na telefóne je prepínač v hornej lište jediné miesto, kde sa
              // téma dá zmeniť — preto plný dotykový cieľ 44 px. Od `md:`
              // (kde ho nesie bočný panel) sa vracia k pôvodnej hustote.
              "inline-flex size-11 items-center justify-center rounded transition-colors duration-100 md:size-6",
              active
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-subtle hover:text-fg",
            )}
          >
            <Icon className="size-[18px] md:size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
