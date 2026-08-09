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
import type { Area } from "@/db/schema";
import { cn } from "@/lib/utils";
import { createIdea } from "@/server/actions/ideas";

import { SparkPicker } from "./spark-picker";

/* ═══════════════════════════════════════════════════════════════════════════
   ZACHYTENIE NÁPADU

   Nápad treba zapísať v sekunde, v ktorej príde — inak sa nezapíše vôbec.
   Preto je povinný jediný údaj (názov) a formulár stojí priamo na obrazovke,
   nie za tlačidlom v dialógu.

   Zvyšok sa dá doplniť aj neskôr, ale ponúka sa hneď: iskra preto, že podľa
   nej triedi inkubátor, a ďalší krok preto, že práve on rozhoduje, či sa
   nápad raz dá povýšiť na projekt, alebo z neho vznikne prázdna škrupina.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Radix Select neberie prázdny reťazec ako hodnotu — „nič" má vlastný kľúč. */
const NONE = "__none__";

/** Predvolená iskra: stred stupnice, nie nadšenie ani nezáujem. */
const DEFAULT_SPARK = 3;

/** Ovládacie prvky: palec pod `sm`, hustota od `sm`. */
const controlClass = "h-11 text-base sm:h-9 sm:text-sm";
const selectContentClass = "[&_[role=option]]:h-11 sm:[&_[role=option]]:h-8";

export interface IdeaCreateFormProps {
  /** Aktívne oblasti do výberu. */
  areas: Area[];
  /**
   * Beží v tej istej tranzícii ako ukladanie, takže dosku vie prekresliť
   * skôr, než server odpovie.
   */
  onOptimisticAdd?: (title: string) => void;
}

export function IdeaCreateForm({ areas, onOptimisticAdd }: IdeaCreateFormProps) {
  const [title, setTitle] = useState("");
  const [spark, setSpark] = useState(DEFAULT_SPARK);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [nextStep, setNextStep] = useState("");
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
        const result = await createIdea({
          title: trimmed,
          spark,
          areaId,
          nextStep: nextStep.trim() === "" ? null : nextStep,
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        /*
          Vyprázdni sa len to, čo patrí konkrétnemu nápadu. Iskra a oblasť
          ostávajú: nápady chodia v zhlukoch a prestavovať to isté pri každom
          zápise je presne to trenie, kvôli ktorému sa prestane zapisovať.
        */
        setTitle("");
        setNextStep("");
        titleRef.current?.focus();
      } catch {
        setError("Nápad sa nepodarilo uložiť. Skús to znova.");
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
      <h2 className="text-[11px] font-semibold tracking-wide uppercase text-fg-subtle">
        Nový nápad
      </h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId("title")} className="sr-only">
          Nápad
        </label>
        <Input
          id={fieldId("title")}
          ref={titleRef}
          value={title}
          maxLength={200}
          autoComplete="off"
          placeholder="Čo ťa napadlo?"
          onChange={(event) => {
            setTitle(event.target.value);
            if (error !== null) setError(null);
          }}
          className={controlClass}
        />
      </div>

      {/* Na 375 px idú iskra a oblasť pod seba; od `sm` vedľa seba. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12px] font-medium text-fg-muted">Iskra</span>
          <div className="flex h-11 items-center sm:h-9">
            <SparkPicker value={spark} onChange={setSpark} label="nový nápad" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[12px] font-medium text-fg-muted">Oblasť</span>
          <Select
            value={areaId ?? NONE}
            onValueChange={(value) => setAreaId(value === NONE ? null : value)}
          >
            <SelectTrigger aria-label="Oblasť nápadu" className={controlClass}>
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
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={fieldId("step")}
          className="text-[12px] font-medium text-fg-muted"
        >
          Ďalší krok
        </label>
        <Input
          id={fieldId("step")}
          value={nextStep}
          maxLength={500}
          autoComplete="off"
          placeholder="Najmenšia vec, ktorou sa to dá pohnúť"
          onChange={(event) => setNextStep(event.target.value)}
          className={controlClass}
        />
        <p className="text-[11px] leading-relaxed text-fg-subtle">
          Nepovinné, ale pri povýšení práve z neho vznikne prvá úloha projektu.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="submit"
          variant="primary"
          disabled={trimmed === "" || isPending}
          className="h-11 sm:h-9"
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
          ) : (
            <Plus aria-hidden="true" size={15} />
          )}
          Zapísať nápad
        </Button>

        <div role="alert" aria-live="polite" className="min-w-0">
          {error !== null ? (
            <p className={cn("text-[13px] font-medium break-words text-danger")}>{error}</p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
