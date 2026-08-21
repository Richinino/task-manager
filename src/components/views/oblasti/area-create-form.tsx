"use client";

import { useRef, useState, useTransition } from "react";
import { LoaderCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createArea } from "@/server/actions/structure";

import { AREA_COLOR_OPTIONS, DEFAULT_AREA_COLOR } from "./area-colors";
import { ColorPicker } from "./color-picker";

/**
 * Založenie oblasti — jeden riadok.
 *
 * Oblasť nemá cieľ ani termín, len názov a farbu, takže formulár nemá čo
 * skrývať a stojí priamo v zozname. Farba sa predvyplní ďalšou v poradí,
 * nie stále tou istou: keby boli všetky oblasti bridlicové, farebná bodka
 * v riadku úlohy by neniesla žiadnu informáciu.
 */
export interface AreaCreateFormProps {
  /** Farby, ktoré už sú použité — nová oblasť dostane inú. */
  usedColors: string[];
  /**
   * Beží v tej istej tranzícii ako ukladanie, takže zoznam vie vykresliť
   * riadok skôr, než server odpovie.
   */
  onOptimisticAdd?: (name: string) => void;
}

/** Prvá farba palety, ktorú ešte nikto nemá; keď sú všetky, začne sa odznova. */
function suggestColor(used: string[]): string {
  const free = AREA_COLOR_OPTIONS.find((option) => !used.includes(option.value));
  return free?.value ?? DEFAULT_AREA_COLOR;
}

export function AreaCreateForm({ usedColors, onOptimisticAdd }: AreaCreateFormProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(() => suggestColor(usedColors));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();

  function submit(): void {
    if (trimmed === "" || isPending) return;

    setError(null);
    startTransition(async () => {
      onOptimisticAdd?.(trimmed);

      try {
        const result = await createArea({ name: trimmed, color });
        if (!result.ok) {
          // Text ostáva v poli — duplicitný názov sa dá opraviť, nie uhádnuť znovu.
          setError(result.error);
          return;
        }
        setName("");
        setColor(suggestColor([...usedColors, color]));
        nameRef.current?.focus();
      } catch {
        setError("Oblasť sa nepodarilo založiť. Skús to znova.");
      }
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-2 rounded border border-border bg-surface p-2"
    >
      <div className="flex min-w-0 items-center gap-1">
        <ColorPicker value={color} onChange={setColor} label="Nová oblasť" />

        <Input
          ref={nameRef}
          value={name}
          maxLength={200}
          autoComplete="off"
          aria-label="Názov novej oblasti"
          placeholder="Nová oblasť — napríklad Zdravie"
          onChange={(event) => {
            setName(event.target.value);
            if (error !== null) setError(null);
          }}
          className="h-11 min-w-0 flex-1 text-base sm:h-9 sm:text-sm"
        />

        <Button
          type="submit"
          variant="primary"
          size="icon"
          disabled={trimmed === "" || isPending}
          aria-label="Založiť oblasť"
          title="Založiť oblasť (Enter)"
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" size={16} className="animate-spin" />
          ) : (
            <Plus aria-hidden="true" size={16} />
          )}
        </Button>
      </div>

      <div role="status" aria-live="polite" className="min-w-0">
        {error !== null ? (
          <p className="px-1 text-meta font-medium text-danger">{error}</p>
        ) : null}
      </div>
    </form>
  );
}
