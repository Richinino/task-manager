"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { updateHabit } from "@/server/actions/habits";

/**
 * Úprava názvu a týždenného cieľa návyku.
 *
 * Doteraz sa návyk dal len založiť, archivovať a zmazať — `updateHabit` na
 * serveri existovala aj s validáciou, ale **nikto ju nevolal**. Zmeniť cieľ
 * z „3× do týždňa" na štyri teda znamenalo návyk zmazať a založiť znova,
 * čím sa stratila celá história aj séria. Práve tá je pritom to jediné, čo
 * návyku dáva zmysel.
 *
 * Úprava sa otvára na požiadanie, nie natrvalo: karta je hlavne na
 * odškrtávanie a trvalé polia by z nej spravili formulár.
 */
export interface HabitEditProps {
  habitId: string;
  title: string;
  targetPerWeek: number;
  /**
   * Prekreslí kartu skôr, než odpovie server.
   *
   * Musí to byť **priamo optimistický setter** z `useOptimistic`, nie funkcia,
   * ktorá si ho obalí do vlastnej `startTransition`. Volá sa totiž vnútri
   * tranzície, ktorá čaká na server, a React na ňu hodnotu priviaže — až kým
   * nedobehne. Vlastná synchrónna tranzícia by skončila okamžite a hodnota by
   * sa vrátila skôr, než by server vôbec odpovedal.
   */
  onOptimistic: (patch: { title?: string; targetPerWeek?: number }) => void;
}

/** Koľkokrát do týždňa. Sedem je „každý deň", nula nedáva zmysel. */
const CIELE = [1, 2, 3, 4, 5, 6, 7] as const;

export function HabitEdit({
  habitId,
  title,
  targetPerWeek,
  onOptimistic,
}: HabitEditProps) {
  const [open, setOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Po otvorení patrí kurzor do poľa — inak treba ďalší klik na to isté miesto.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function ulozNazov(): void {
    const next = draftTitle.trim();
    if (next === "" || next === title) {
      setDraftTitle(title);
      setOpen(false);
      return;
    }

    setError(null);
    startTransition(async () => {
      // Pred prvý `await` — inak nemá React tranzíciu, ku ktorej hodnotu
      // priviazať. Späť ju vráti sám, keď tranzícia dobehne.
      onOptimistic({ title: next });
      try {
        const result = await updateHabit(habitId, { title: next });
        if (!result.ok) {
          setError(result.error);
          setDraftTitle(title);
          return;
        }
        setOpen(false);
      } catch {
        setError("Návyk sa nepodarilo uložiť. Skús to znova.");
        setDraftTitle(title);
      }
    });
  }

  function ulozCiel(hodnota: number): void {
    if (hodnota === targetPerWeek) return;

    setError(null);
    startTransition(async () => {
      // Pred prvý `await`, rovnako ako pri názve vyššie.
      onOptimistic({ targetPerWeek: hodnota });
      try {
        const result = await updateHabit(habitId, { targetPerWeek: hodnota });
        if (!result.ok) setError(result.error);
      } catch {
        setError("Cieľ sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={`Upraviť návyk ${title}`}
        title="Upraviť názov a cieľ"
      >
        <Pencil aria-hidden="true" size={14} />
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={draftTitle}
          maxLength={120}
          disabled={isPending}
          aria-label="Názov návyku"
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              ulozNazov();
            }
            if (event.key === "Escape") {
              event.stopPropagation();
              setDraftTitle(title);
              setOpen(false);
              setError(null);
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={ulozNazov}
          disabled={isPending}
          aria-label="Uložiť názov"
          className="shrink-0"
        >
          <Check aria-hidden="true" size={14} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            setDraftTitle(title);
            setOpen(false);
            setError(null);
          }}
          aria-label="Zrušiť úpravu"
          className="shrink-0"
        >
          <X aria-hidden="true" size={14} />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="shrink-0 text-meta text-fg-muted">Cieľ za týždeň</span>
        <Select
          value={String(targetPerWeek)}
          onValueChange={(value) => ulozCiel(Number(value))}
        >
          <SelectTrigger aria-label="Cieľ za týždeň" className="w-28 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CIELE.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n === 7 ? "každý deň" : `${n}× týždenne`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p role="alert" className={cn("text-meta text-danger")}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
