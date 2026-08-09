"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";

import { RITUAL_META, type RitualPeriod, type RitualType } from "@/lib/rituals";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { completeRitual, saveRitualStep } from "@/server/actions/rituals";

/* ═══════════════════════════════════════════════════════════════════════════
   KOSTRA SPRIEVODCU

   Spoločná pre všetky štyri rituály. Rieši kroky, priebežné ukladanie,
   uzavretie a to, aby zavretie v polovici nič nestratilo.

   Rituál sa ukladá PO KAŽDOM KROKU. Sprievodca má štyri až šesť krokov a
   zavrieť ho v polovici je bežné — Escape nesmie znamenať stratu. `completedAt`
   sa vyplní až na záver, takže rozrobený a hotový rituál sa dajú odlíšiť.

   Kto pridáva ďalší rituál: definuj kroky a odovzdaj ich sem. Kostra nevie
   nič o obsahu — dostane pole krokov a každý si vykreslí, čo potrebuje.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Odpovede sprievodcu. Tvar si určuje každý rituál sám, ukladá sa ako jsonb. */
export type RitualPayload = Record<string, unknown>;

export interface RitualStepContext {
  payload: RitualPayload;
  /** Zapíše hodnotu do odpovedí. Uloží sa pri prechode na ďalší krok. */
  setValue: (key: string, value: unknown) => void;
}

export interface RitualStep {
  key: string;
  title: string;
  /** Vysvetlenie pod nadpisom. Jedna veta, prečo tento krok existuje. */
  hint?: string;
  render: (context: RitualStepContext) => React.ReactNode;
  /**
   * Dá sa z kroku pokračovať? Predvolene áno — rituál nemá byť skúška.
   * Používa to len denník, ktorý potrebuje aspoň niečo.
   */
  canAdvance?: (payload: RitualPayload) => boolean;
}

export interface RitualShellProps {
  type: RitualType;
  period: RitualPeriod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: RitualStep[];
  /** Rozrobené odpovede zo servera, ak sa rituál už začal. */
  initialPayload?: RitualPayload;
  /** Zavolá sa po úspešnom uzavretí — napr. na zatvorenie a poďakovanie. */
  onCompleted?: () => void;
}

export function RitualShell({
  type,
  period,
  open,
  onOpenChange,
  steps,
  initialPayload,
  onCompleted,
}: RitualShellProps) {
  const [index, setIndex] = useState(0);
  const [payload, setPayload] = useState<RitualPayload>(initialPayload ?? {});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /** Posledný stav, ktorý potvrdil server — aby sa neukladalo to isté dvakrát. */
  const savedRef = useRef<string>(JSON.stringify(initialPayload ?? {}));

  const meta = RITUAL_META[type];
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const setValue = useCallback((key: string, value: unknown) => {
    setPayload((previous) => ({ ...previous, [key]: value }));
    setError(null);
  }, []);

  const context = useMemo<RitualStepContext>(
    () => ({ payload, setValue }),
    [payload, setValue],
  );

  const canAdvance = step?.canAdvance?.(payload) ?? true;

  /** Uloží rozrobený stav, ak sa od posledného uloženia zmenil. */
  function persist(): Promise<void> {
    const snapshot = JSON.stringify(payload);
    if (snapshot === savedRef.current) return Promise.resolve();
    return saveRitualStep(type, period, payload).then((result) => {
      if (result.ok) savedRef.current = snapshot;
      else setError(result.error);
    });
  }

  function goNext(): void {
    if (!canAdvance) return;
    startTransition(async () => {
      try {
        await persist();
      } catch {
        setError("Rozrobený rituál sa nepodarilo uložiť.");
        return;
      }
      setIndex((current) => Math.min(current + 1, steps.length - 1));
    });
  }

  function goBack(): void {
    setIndex((current) => Math.max(current - 1, 0));
    setError(null);
  }

  function finish(): void {
    startTransition(async () => {
      try {
        const result = await completeRitual(type, period, payload);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        savedRef.current = JSON.stringify(payload);
        onOpenChange(false);
        onCompleted?.();
      } catch {
        setError("Rituál sa nepodarilo uzavrieť.");
      }
    });
  }

  /**
   * Zavretie v polovici uloží rozrobené a NEUZAVRIE rituál. Nabudúce sa
   * pokračuje tam, kde sa skončilo — preto sa `completedAt` vypĺňa až na konci.
   */
  function handleOpenChange(next: boolean): void {
    if (!next && !isPending) {
      startTransition(async () => {
        try {
          await persist();
        } catch {
          // Zavretie nemá na čom stroskotať — rozrobený rituál nie je záväzok.
        }
        onOpenChange(false);
      });
      return;
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span>{meta.title}</span>
            <span className="text-[13px] font-normal text-fg-subtle">
              {meta.minutes} min
            </span>
          </DialogTitle>
          <DialogDescription>{meta.purpose}</DialogDescription>
        </DialogHeader>

        {/* Postup — tenký pruh a číslo. Rituál má byť vidieť, že má koniec. */}
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2"
          >
            <div
              style={{ width: `${((index + 1) / steps.length) * 100}%` }}
              className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
            />
          </div>
          <span className="shrink-0 text-[12px] tabular-nums text-fg-subtle">
            {index + 1}/{steps.length}
          </span>
        </div>

        {step ? (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-fg">{step.title}</h3>
              {step.hint ? (
                <p className="text-[13px] leading-relaxed text-fg-muted">{step.hint}</p>
              ) : null}
            </div>

            <div className="max-h-[45dvh] min-h-0 overflow-y-auto">
              {step.render(context)}
            </div>
          </div>
        ) : null}

        <div aria-live="polite" className="min-h-5">
          {error ? (
            <p className="text-[13px] leading-relaxed text-danger">{error}</p>
          ) : null}
        </div>

        <DialogFooter className="items-center">
          {index > 0 ? (
            <Button type="button" variant="ghost" onClick={goBack} disabled={isPending}>
              Späť
            </Button>
          ) : null}

          {isLast ? (
            <Button
              type="button"
              variant="primary"
              onClick={finish}
              disabled={isPending || !canAdvance}
              className="gap-1.5"
            >
              {isPending ? (
                <LoaderCircle aria-hidden="true" size={14} className="animate-spin" />
              ) : (
                <Check aria-hidden="true" size={14} />
              )}
              Zavrieť {meta.title.toLowerCase()}
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={goNext}
              disabled={isPending || !canAdvance}
            >
              Ďalej
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Spoločný vzhľad riadku so zoznamom v kroku — používajú ho všetky rituály. */
export const ritualRowClass = cn(
  "flex items-start gap-2.5 rounded border border-border bg-surface px-3 py-2.5",
);
