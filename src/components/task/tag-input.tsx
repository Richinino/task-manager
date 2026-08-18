"use client";

import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { fold } from "@/lib/fold";
import { Input } from "@/components/ui/input";
import type { TagView } from "@/components/task/task-detail-data";
import { attachTag, detachTag } from "@/server/actions/structure";

/* ═══════════════════════════════════════════════════════════════════════════
   ŠTÍTKY ÚLOHY

   Parser ukladá `#tag` už pri zachytení — tu sa konečne aj zobrazí a dá
   sa meniť. Štítok sa priraďuje menom (`attachTag` si ho v prípade potreby
   sám založí) a odoberá identifikátorom (`detachTag`).

   Návrhy sú obyčajné tlačidlá, nie `<datalist>`: natívny zoznam sa na iOS
   nezobrazuje spoľahlivo a prstom sa v ňom vyberať nedá.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Koľko návrhov naraz. Viac než tucet už nie je návrh, ale zoznam. */
const MAX_SUGGESTIONS = 8;

/** Rovnaká hranica ako v `attachTag`. */
const MAX_TAG_LENGTH = 64;

const TEMP_PREFIX = "tmp:";

function isTemp(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}

/** Štítok sa píše s mriežkou aj bez nej; ukladá sa vždy bez nej. */
function normalize(raw: string): string {
  return raw.replace(/^#+/u, "").trim();
}

export interface TagInputProps {
  taskId: string;
  tags: TagView[];
  /** Setter, nie `onChange` — pri rýchlom klikaní beží viac zápisov naraz. */
  setTags: Dispatch<SetStateAction<TagView[]>>;
  /** Všetky štítky používateľa, od najpoužívanejších. */
  suggestions: TagView[];
}

export function TagInput({ taskId, tags, setTags, suggestions }: TagInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const query = normalize(value);

  /** Mená, ktoré úloha už má — porovnáva sa bez ohľadu na veľkosť písmen. */
  const attached = useMemo(
    () => new Set(tags.map((tag) => tag.name.toLocaleLowerCase("sk"))),
    [tags],
  );

  /*
    Návrhy sa porovnávajú cez `fold()`, teda bez ohľadu na diakritiku — „trening"
    nájde „tréning". Predtým tu bolo obyčajné `toLocaleLowerCase`, čo bola
    jediná výnimka v celej appke: fulltext aj paleta skladajú diakritiku, a keď
    to jedno pole robí inak, človek si myslí, že štítok neexistuje, a založí
    druhý s tým istým významom.
  */
  const offered = useMemo(() => {
    const needle = fold(query);
    return suggestions
      .filter((tag) => !attached.has(tag.name.toLocaleLowerCase("sk")))
      .filter((tag) => needle === "" || fold(tag.name).includes(needle))
      .slice(0, MAX_SUGGESTIONS);
  }, [suggestions, attached, query]);

  /**
   * Priradí štítok. Prekreslí sa hneď s dočasným identifikátorom; ten sa
   * po odpovedi vymení za skutočný, aby sa dal štítok vzápätí aj odobrať.
   */
  function attach(raw: string): void {
    const name = normalize(raw);
    if (name === "") return;

    if (name.length > MAX_TAG_LENGTH) {
      setError("Štítok je príliš dlhý.");
      return;
    }
    if (attached.has(name.toLocaleLowerCase("sk"))) {
      setError(`Štítok „${name}" už na úlohe je.`);
      setValue("");
      return;
    }

    const tempId = `${TEMP_PREFIX}${name}`;
    const before = tags;

    setValue("");
    setError(null);
    setTags((previous) => [...previous, { id: tempId, name }]);
    inputRef.current?.focus();

    startTransition(async () => {
      function giveUp(message: string): void {
        setTags(before);
        setError(message);
      }

      try {
        const result = await attachTag(taskId, name);
        if (!result.ok) {
          giveUp(result.error);
          return;
        }
        const realId = result.data.tagId;
        setTags((previous) =>
          previous.map((tag) => (tag.id === tempId ? { ...tag, id: realId } : tag)),
        );
      } catch {
        giveUp("Štítok sa nepodarilo priradiť. Skús to znova.");
      }
    });
  }

  /** Odoberie štítok z úlohy. Samotný štítok ostáva v číselníku. */
  function detach(tag: TagView): void {
    if (isTemp(tag.id)) return;

    const before = tags;
    setTags((previous) => previous.filter((item) => item.id !== tag.id));
    setError(null);

    startTransition(async () => {
      try {
        const result = await detachTag(taskId, tag.id);
        if (result.ok) return;
        setTags(before);
        setError(result.error);
      } catch {
        setTags(before);
        setError("Štítok sa nepodarilo odobrať. Skús to znova.");
      }
    });
  }

  const inputId = `${taskId}-tag`;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Priradené štítky. Zalamujú sa — počet nie je nijako obmedzený. */}
      {tags.length > 0 ? (
        <ul className="flex min-w-0 flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag.id} className="min-w-0">
              <span
                className={cn(
                  "inline-flex h-9 max-w-full min-w-0 items-center gap-1 rounded border border-border",
                  "bg-surface-2 pl-2 pr-1 text-[13px] text-fg md:h-7",
                  isTemp(tag.id) && "opacity-60",
                )}
              >
                <span className="min-w-0 truncate" title={`#${tag.name}`}>
                  #{tag.name}
                </span>
                <button
                  type="button"
                  disabled={isTemp(tag.id)}
                  onClick={() => detach(tag)}
                  aria-label={`Odobrať štítok #${tag.name}`}
                  title={`Odobrať štítok #${tag.name}`}
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded md:size-5",
                    "text-fg-subtle transition-colors duration-100 ease-out",
                    "hover:bg-danger/10 hover:text-danger",
                    "disabled:pointer-events-none disabled:opacity-35",
                  )}
                >
                  <X aria-hidden="true" size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex min-w-0 items-center gap-1.5">
        <label htmlFor={inputId} className="sr-only">
          Pridať štítok
        </label>
        <Input
          id={inputId}
          ref={inputRef}
          value={value}
          maxLength={MAX_TAG_LENGTH + 1}
          placeholder="#rodina"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setValue(event.target.value);
            if (error !== null) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            if (event.nativeEvent.isComposing) return;
            event.preventDefault();
            attach(value);
          }}
          className="h-11 min-w-0 flex-1 text-base md:h-9 md:text-sm"
        />
        <button
          type="button"
          disabled={query === ""}
          onClick={() => attach(value)}
          aria-label="Pridať štítok"
          title="Pridať štítok (Enter)"
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded border border-border",
            "bg-surface text-fg-muted transition-colors duration-100 ease-out",
            "hover:border-border-strong hover:bg-surface-2 hover:text-fg",
            "disabled:pointer-events-none disabled:opacity-35",
            "md:size-9",
          )}
        >
          <Plus aria-hidden="true" size={16} />
        </button>
      </div>

      {/* Návrhy z už použitých štítkov — druhýkrát sa to isté nepíše ručne. */}
      {offered.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-[11px] text-fg-subtle">Použité:</span>
          {offered.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => attach(tag.name)}
              aria-label={`Pridať štítok #${tag.name}`}
              className={cn(
                "inline-flex h-8 max-w-40 min-w-0 items-center rounded border border-dashed border-border",
                "px-2 text-[12px] text-fg-muted transition-colors duration-100 ease-out",
                "hover:border-accent hover:text-fg md:h-6",
              )}
            >
              <span className="min-w-0 truncate">#{tag.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {error !== null ? (
        <p role="alert" className="text-[11px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
