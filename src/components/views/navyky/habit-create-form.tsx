"use client";

import { useId, useRef, useState, useTransition } from "react";
import { LoaderCircle, Plus } from "lucide-react";

import { AreaDot } from "@/components/task/area-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorPicker } from "@/components/views/oblasti/color-picker";
import { cn } from "@/lib/utils";
import { createHabit } from "@/server/actions/habits";

import { suggestHabitColor } from "./habit-colors";
import type { HabitAreaOption } from "./habit-types";

/* ═══════════════════════════════════════════════════════════════════════════
   ZALOŽENIE NÁVYKU

   Formulár stojí priamo na obrazovke, nie v dialógu — návykov je zopár a
   založiť ďalší je bežná vec, nie obrad. Polia sú tri a všetky sa vojdú na
   jednu obrazovku telefónu.

   Cieľ je povinná súčasť, nie doplnok. Návyk bez čísla „X× do týždňa" nemá
   podľa čoho vyhodnotiť týždeň, takže by nemal ani sériu — a séria je jediné,
   čo návyk drží pri živote. Predvolené sú štyri razy: každodenný cieľ znie
   pekne, ale prvý zmeškaný deň ho zlomí a človek to vzdá.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Radix Select neberie prázdny reťazec ako hodnotu — „nič" má vlastný kľúč. */
const NONE = "__none__";

/** Cieľ je 1–7, presne ako ho pripúšťa `targetSchema` v akcii. */
const TARGET_CHOICES: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * Štyri razy do týždňa. Dosť na to, aby sa vec stala zvykom, a málo na to, aby
 * jeden pokazený deň nezhodil sériu — presne kvôli tomuto je cieľ týždenný.
 */
const DEFAULT_TARGET = 4;

function targetLabel(times: number): string {
  if (times === 7) return "7× do týždňa — každý deň";
  return `${times}× do týždňa`;
}

export interface HabitCreateFormProps {
  /** Živé oblasti do výberu. Archivované sa neponúkajú. */
  areas: readonly HabitAreaOption[];
  /** Farby, ktoré už návyky majú — nový dostane inú. */
  usedColors: readonly string[];
  /**
   * Beží v tej istej tranzícii ako ukladanie, takže zoznam vie vykresliť
   * kartu skôr, než server odpovie.
   */
  onOptimisticAdd?: (title: string) => void;
}

export function HabitCreateForm({
  areas,
  usedColors,
  onOptimisticAdd,
}: HabitCreateFormProps) {
  const [title, setTitle] = useState("");
  const [targetPerWeek, setTargetPerWeek] = useState(DEFAULT_TARGET);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [color, setColor] = useState(() => suggestHabitColor(usedColors));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);

  const ids = useId();
  const fieldId = (field: string): string => `${ids}-${field}`;

  const trimmed = title.trim();

  function submit(): void {
    if (trimmed === "" || isPending) return;

    setError(null);
    startTransition(async () => {
      onOptimisticAdd?.(trimmed);

      try {
        const result = await createHabit({
          title: trimmed,
          targetPerWeek,
          color,
          areaId,
        });

        if (!result.ok) {
          // Text ostáva v poli — odmietnutý názov sa dá opraviť, nie uhádnuť znovu.
          setError(result.error);
          return;
        }

        setTitle("");
        setAreaId(null);
        // Cieľ sa NERESETUJE zámerne: kto zakladá tri návyky za sebou, chce
        // pre ne spravidla rovnaký režim a prestavovať ho zakaždým znova
        // je otrava.
        setColor(suggestHabitColor([...usedColors, color]));
        titleRef.current?.focus();
      } catch {
        setError("Návyk sa nepodarilo založiť. Skús to znova.");
      }
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3 rounded border border-border bg-surface p-3"
    >
      <h2 className="label text-fg-subtle">
        Nový návyk
      </h2>

      <div className="flex min-w-0 items-center gap-1">
        <ColorPicker value={color} onChange={setColor} label="Nový návyk" />

        <Input
          id={fieldId("title")}
          ref={titleRef}
          value={title}
          maxLength={200}
          autoComplete="off"
          aria-label="Názov nového návyku"
          placeholder="Napríklad: cvičiť, čítať, ísť skoro spať"
          onChange={(event) => {
            setTitle(event.target.value);
            if (error !== null) setError(null);
          }}
          className={cn("min-w-0 flex-1")}
        />
      </div>

      {/* Na 375 px idú cieľ a oblasť pod seba; od `sm` vedľa seba. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-meta font-medium text-fg-muted">Cieľ</span>
          <Select
            value={String(targetPerWeek)}
            onValueChange={(value) => setTargetPerWeek(Number(value))}
          >
            <SelectTrigger aria-label="Koľkokrát do týždňa">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGET_CHOICES.map((times) => (
                <SelectItem key={times} value={String(times)}>
                  {targetLabel(times)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-meta font-medium text-fg-muted">Oblasť</span>
          <Select
            value={areaId ?? NONE}
            onValueChange={(value) => setAreaId(value === NONE ? null : value)}
          >
            <SelectTrigger aria-label="Oblasť návyku">
              <SelectValue placeholder="Bez oblasti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Bez oblasti</SelectItem>
              {areas.length > 0 ? <SelectSeparator /> : null}
              {areas.map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <AreaDot color={area.color} showName={false} size="sm" />
                    <span className="truncate">{area.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="submit"
          variant="primary"
          disabled={trimmed === "" || isPending}
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
          ) : (
            <Plus aria-hidden="true" size={15} />
          )}
          Založiť návyk
        </Button>

        <div role="status" aria-live="polite" className="min-w-0">
          {error !== null ? (
            <p className="text-body font-medium text-danger">{error}</p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
