"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Formát musí sedieť s inicializačným skriptom v src/app/layout.tsx. */
type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

const OPTIONS: { value: Theme; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Svetlá téma", Icon: Sun },
  { value: "dark", label: "Tmavá téma", Icon: Moon },
  { value: "system", label: "Podľa systému", Icon: Monitor },
];

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // Súkromný režim alebo zakázané úložisko — spadneme na systém.
  }
  return "system";
}

function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Prepínač témy. Trvalý stav je v localStorage pod kľúčom "theme";
 * prvotné nastavenie triedy `.dark` rieši skript v koreňovom layoute,
 * tu ho už len udržiavame.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // Pred pripojením nevieme, čo je v localStorage — nič nezvýrazňujeme,
  // aby sa server a klient nerozišli pri hydratácii.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(readStoredTheme());
  }, []);

  // Pri voľbe „podľa systému" musíme reagovať na zmenu systémového nastavenia.
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  function choose(next: Theme): void {
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Nevadí — téma bude platiť aspoň do konca relácie.
    }
    applyTheme(next);
  }

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
            onClick={() => choose(value)}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded transition-colors duration-100",
              active
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-subtle hover:text-fg",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
