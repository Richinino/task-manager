"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { LoaderCircle, Plus } from "lucide-react";

import type { Area } from "@/db/schema";
import { cn } from "@/lib/utils";
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
import { createProject } from "@/server/actions/structure";

/* ═══════════════════════════════════════════════════════════════════════════
   ZALOŽENIE PROJEKTU

   Formulár stojí priamo na obrazovke, nie v dialógu. Zakladanie projektu je
   vzácne, ale je to rozhodnutie, nie mimochodom — a schované za tlačidlom by
   sa naň zabudlo. Úlohy potom visia v inboxe bez toho, aby ich niečo držalo
   pokope.

   Sú tu štyri polia. Názov je povinný, zvyšok nie — ale „definícia hotovo"
   je tu zámerne hneď od začiatku: dopísať ju dodatočne nikto nepríde
   a projekt bez nej sa nikdy nezavrie.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Radix Select neberie prázdny reťazec ako hodnotu — „nič" má vlastný kľúč. */
const NONE = "__none__";

/** Ovládacie prvky: palec pod `sm`, hustota od `sm`. */
const controlClass = "h-11 text-base sm:h-9 sm:text-sm";

/** Položky rozbaleného výberu musia byť na dotyk rovnako veľké ako spúšťač. */
const selectContentClass = "[&_[role=option]]:h-11 sm:[&_[role=option]]:h-8";

export interface ProjectCreateFormProps {
  /** Aktívne oblasti do výberu. Archivované sa neponúkajú. */
  areas: Area[];
  /**
   * Beží v tej istej tranzícii ako ukladanie, takže zoznam vie vykresliť
   * kartu skôr, než server odpovie.
   */
  onOptimisticAdd?: (name: string) => void;
}

export function ProjectCreateForm({ areas, onOptimisticAdd }: ProjectCreateFormProps) {
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState("");
  const [definitionOfDone, setDefinitionOfDone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  const ids = useId();
  const fieldId = (field: string): string => `${ids}-${field}`;

  const trimmedName = name.trim();

  function submit(): void {
    if (trimmedName === "" || isPending) return;

    setError(null);
    setCreated(null);

    startTransition(async () => {
      onOptimisticAdd?.(trimmedName);

      try {
        const result = await createProject({
          name: trimmedName,
          areaId,
          // Rozpísaný rok („0002-08-07") by prešiel a projekt by odletel
          // do staroveku — do akcie ide len hotový dátum.
          deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) && deadline >= "1900-01-01"
            ? deadline
            : null,
          definitionOfDone: definitionOfDone.trim() === "" ? null : definitionOfDone,
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        // Polia sa vyprázdnia až po potvrdení: keď server názov odmietne
        // (napríklad kvôli duplicite), text musí ostať tam, kde bol.
        setCreated({ id: result.data.id, name: trimmedName });
        setName("");
        setAreaId(null);
        setDeadline("");
        setDefinitionOfDone("");
        nameRef.current?.focus();
      } catch {
        setError("Projekt sa nepodarilo založiť. Skús to znova.");
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
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
        Nový projekt
      </h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId("name")} className="text-[12px] font-medium text-fg-muted">
          Názov
        </label>
        <Input
          id={fieldId("name")}
          ref={nameRef}
          value={name}
          maxLength={200}
          autoComplete="off"
          placeholder="Napríklad: Presťahovať sa do nového bytu"
          onChange={(event) => {
            setName(event.target.value);
            if (error !== null) setError(null);
          }}
          className={controlClass}
        />
      </div>

      {/* Na 375 px idú oblasť a termín pod seba; od `sm` vedľa seba. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12px] font-medium text-fg-muted">Oblasť</span>
          <Select
            value={areaId ?? NONE}
            onValueChange={(value) => setAreaId(value === NONE ? null : value)}
          >
            <SelectTrigger aria-label="Oblasť projektu" className={controlClass}>
              <SelectValue placeholder="Bez oblasti" />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
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

        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor={fieldId("deadline")}
            className="text-[12px] font-medium text-fg-muted"
          >
            Termín projektu
          </label>
          <Input
            id={fieldId("deadline")}
            type="date"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
            className={cn(controlClass, "dark:[color-scheme:dark]")}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={fieldId("dod")}
          className="text-[12px] font-medium text-fg-muted"
        >
          Definícia hotovo
        </label>
        <textarea
          id={fieldId("dod")}
          value={definitionOfDone}
          rows={2}
          maxLength={5000}
          placeholder="Podľa čoho spoznáš, že projekt je uzavretý?"
          onChange={(event) => setDefinitionOfDone(event.target.value)}
          className={cn(
            "w-full resize-y rounded border border-border bg-surface px-2.5 py-2",
            "text-base leading-relaxed text-fg placeholder:text-fg-subtle sm:text-sm",
            "transition-colors duration-100 ease-out hover:border-border-strong",
          )}
        />
        <p className="text-[11px] leading-relaxed text-fg-subtle">
          Bez nej sa projekt nikdy nezavrie — vždy sa nájde ešte jedna úloha.
          Dá sa doplniť aj neskôr v detaile.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="submit"
          variant="primary"
          disabled={trimmedName === "" || isPending}
          className="h-11 sm:h-9"
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
          ) : (
            <Plus aria-hidden="true" size={15} />
          )}
          Založiť projekt
        </Button>

        <div role="status" aria-live="polite" className="min-w-0">
          {error !== null ? (
            <p className="text-[13px] font-medium text-danger">{error}</p>
          ) : created !== null ? (
            <p className="text-[13px] text-fg-muted">
              <span className="text-success">Založené.</span>{" "}
              <Link
                href={`/projekty/${created.id}`}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                Otvoriť „{created.name}"
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
