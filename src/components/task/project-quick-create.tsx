"use client";

import { useState, useTransition } from "react";
import { FolderPlus, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProject } from "@/server/actions/structure";

/**
 * Založenie projektu priamo pri zaraďovaní úlohy.
 *
 * Bez toho sa človek v detaile úlohy dostane do slepej uličky: vidí, že
 * úloha do projektu patrí, ale ten projekt ešte neexistuje — a jediná cesta
 * von je zavrieť panel, prejsť na Projekty, založiť ho, vrátiť sa a nájsť
 * úlohu znova. Rýchle zachytenie to vie od fázy 1; detail nie, a práve tam
 * sa zaraďuje najčastejšie.
 *
 * Pole sa otvára až po kliknutí. Trvalo viditeľné by z výberu projektu
 * spravilo formulár a najčastejší prípad — priradiť existujúci — by predĺžilo.
 */
export interface ProjectQuickCreateProps {
  /** Priradí novo vzniknutý projekt úlohe. */
  onCreated: (project: { id: string; name: string }) => void;
}

export function ProjectQuickCreate({ onCreated }: ProjectQuickCreateProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(): void {
    const trimmed = name.trim();
    if (trimmed === "") return;

    setError(null);
    startTransition(async () => {
      try {
        const result = await createProject({ name: trimmed });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onCreated({ id: result.data.id, name: trimmed });
        setName("");
        setOpen(false);
      } catch {
        setError("Projekt sa nepodarilo založiť. Skús to znova.");
      }
    });
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="self-start text-fg-muted"
      >
        <FolderPlus aria-hidden="true" size={13} />
        Nový projekt
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Input
          // Preverená výnimka: pravidlo mieri na zaostrenie pri načítaní stránky,
          // ktoré človeka odhodí z miesta, kde bol. Tu je to naopak — pole vzniká až po kliknutí na „Nový projekt“.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={name}
          maxLength={120}
          disabled={isPending}
          placeholder="Názov projektu"
          aria-label="Názov nového projektu"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            // Enter zakladá, Escape zatvára — v paneli, ktorý sa ukladá sám,
            // by tlačidlo „Zrušiť" bolo len ďalší prvok navyše.
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
              setName("");
              setError(null);
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={submit}
          disabled={isPending || name.trim() === ""}
          className="shrink-0"
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" size={14} className="animate-spin" />
          ) : null}
          Založiť
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
