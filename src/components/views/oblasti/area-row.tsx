"use client";

import { useEffect, useState, useTransition } from "react";
import { Archive, ArchiveRestore, LoaderCircle, Trash2 } from "lucide-react";

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
import { archiveArea, deleteArea, updateArea } from "@/server/actions/structure";
import type { AreaWithCounts } from "@/server/queries/structure";

import { ColorPicker } from "./color-picker";

/* ═══════════════════════════════════════════════════════════════════════════
   RIADOK OBLASTI

   Oblasť je málo údajov — názov, farba, dve čísla. Preto tu nie je detailová
   obrazovka: premenováva sa priamo v riadku a farba sa mení bublinou vedľa
   názvu. Ukladá sa samo, ako všade inde v aplikácii.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Slovenské skloňovanie: 1 úloha · 2–4 úlohy · 0 a 5+ úloh. */
export function taskCountLabel(count: number): string {
  if (count === 1) return "1 úloha";
  if (count >= 2 && count <= 4) return `${count} úlohy`;
  return `${count} úloh`;
}

/** Slovenské skloňovanie: 1 projekt · 2–4 projekty · 0 a 5+ projektov. */
export function projectCountLabel(count: number): string {
  if (count === 1) return "1 projekt";
  if (count >= 2 && count <= 4) return `${count} projekty`;
  return `${count} projektov`;
}

export interface AreaRowProps {
  area: AreaWithCounts;
  /**
   * Archivácia aj zmazanie riadok zo zoznamu odoberajú — rodič ho skryje
   * hneď, bez čakania na server.
   */
  onOptimisticRemove: (id: string) => void;
  /**
   * Chyba archivácie alebo mazania patrí rodičovi, nie riadku.
   *
   * Riadok sa pri týchto dvoch akciách odmontuje skôr, než odpoveď príde —
   * hláška vykreslená v ňom by nemala kde vzniknúť a používateľ by videl len
   * to, že oblasť zmizla a zase sa vrátila. Chyby vlastných polí (názov,
   * farba) si riadok naďalej rieši sám, tam nikam nemizne.
   */
  onError: (message: string) => void;
}

export function AreaRow({ area, onOptimisticRemove, onError }: AreaRowProps) {
  const [name, setName] = useState(area.name);
  const [color, setColor] = useState(area.color);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  /*
    Posledný stav potvrdený serverom — sem sa pole vracia, keď zápis zlyhá.
    Je to stav, nie ref: nesie ho aj `aria-label` tlačidiel („Zmazať oblasť
    Zdravie"), takže po premenovaní sa musí prekresliť.
  */
  const [savedName, setSavedName] = useState(area.name);
  const [savedColor, setSavedColor] = useState(area.color);

  const archived = area.archivedAt !== null;

  /* Hláška o chybe sa nezatvára — sama zmizne. */
  useEffect(() => {
    if (error === null) return;
    const timer = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  function commitName(): void {
    const next = name.trim();
    if (next === savedName) {
      // Aj samotné orezanie medzier je zmena zobrazenia — vrátime pole
      // do podoby, ktorá naozaj platí.
      setName(savedName);
      return;
    }
    if (next === "") {
      setName(savedName);
      setError("Oblasť musí mať názov.");
      return;
    }

    setName(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateArea(area.id, { name: next });
        if (result.ok) {
          setSavedName(next);
          return;
        }
        setName(savedName);
        setError(result.error);
      } catch {
        setName(savedName);
        setError("Názov sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  function commitColor(next: string): void {
    if (next === savedColor) return;

    setColor(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateArea(area.id, { color: next });
        if (result.ok) {
          setSavedColor(next);
          return;
        }
        setColor(savedColor);
        setError(result.error);
      } catch {
        setColor(savedColor);
        setError("Farbu sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  function toggleArchive(): void {
    setError(null);
    startTransition(async () => {
      // Riadok mení pásmo (živé ↔ archív), takže z tohto zoznamu zmizne hneď.
      onOptimisticRemove(area.id);
      try {
        const result = await archiveArea(area.id, !archived);
        if (!result.ok) onError(result.error);
      } catch {
        onError("Zmenu sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  function remove(): void {
    setError(null);
    // Dialóg sa zatvára hneď: riadok o chvíľu zmizne aj s ním a potvrdenie,
    // ktoré ostane visieť nad prázdnym miestom, pôsobí ako zaseknutá appka.
    setConfirmOpen(false);
    startTransition(async () => {
      onOptimisticRemove(area.id);
      try {
        const result = await deleteArea(area.id);
        if (!result.ok) onError(result.error);
      } catch {
        onError("Oblasť sa nepodarilo zmazať. Skús to znova.");
      }
    });
  }

  const detaches = area.openTaskCount > 0 || area.projectCount > 0;

  return (
    <li className="min-w-0 rounded border border-border bg-surface px-2 py-2">
      <div className="flex min-w-0 items-start gap-1">
        <ColorPicker value={color} onChange={commitColor} label={savedName} />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
          {/*
            Premenovanie na mieste: pole je bez rámu, kým sa naň nesiahne.
            Ukladá sa pri opustení poľa alebo Enterom, Escape vráti pôvodný
            názov. Písmo má 16 px — menšie si mobilné prehliadače vysvetlia
            ako „toto sa nedá prečítať" a stránku pri fokuse priblížia.
          */}
          <input
            value={name}
            maxLength={200}
            autoComplete="off"
            spellCheck={false}
            aria-label={`Názov oblasti ${savedName}`}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") {
                event.preventDefault();
                commitName();
                event.currentTarget.blur();
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setName(savedName);
                event.currentTarget.blur();
              }
            }}
            className={cn(
              "h-11 w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 sm:h-8",
              "text-base font-medium text-fg sm:text-sm",
              "transition-colors duration-100 ease-out hover:border-border",
              "focus:border-border-strong focus:bg-surface-2",
            )}
          />

          <p className="min-w-0 truncate px-1.5 text-mini text-fg-subtle">
            {taskCountLabel(area.openTaskCount)} · {projectCountLabel(area.projectCount)}
            {archived ? " · archivovaná" : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {isPending ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin text-fg-subtle"
            />
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleArchive}
            disabled={isPending}
            aria-label={
              archived
                ? `Vrátiť oblasť ${savedName} z archívu`
                : `Archivovať oblasť ${savedName}`
            }
            title={
              archived
                ? "Vrátiť z archívu"
                : "Archivovať — oblasť sa schová z výberov, úlohy aj projekty ostanú"
            }
            className="size-11 sm:size-8"
          >
            {archived ? (
              <ArchiveRestore aria-hidden="true" size={15} />
            ) : (
              <Archive aria-hidden="true" size={15} />
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setConfirmOpen(true)}
            disabled={isPending}
            aria-label={`Zmazať oblasť ${savedName}`}
            title="Zmazať — oblasť sa zahodí, úlohy a projekty sa od nej odpoja"
            className="size-11 text-danger hover:bg-danger/10 hover:text-danger sm:size-8"
          >
            <Trash2 aria-hidden="true" size={15} />
          </Button>
        </div>
      </div>

      {error !== null ? (
        <p role="alert" className="mt-1 px-1.5 text-meta font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        {confirmOpen ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Zmazať oblasť „{savedName}"?</DialogTitle>
              <DialogDescription>
                {detaches
                  ? `Oblasť sa zahodí. ${taskCountLabel(area.openTaskCount)} a ${projectCountLabel(area.projectCount)} sa od nej odpojí — nič sa nezmaže, len stratia príslušnosť. Späť sa to vrátiť nedá.`
                  : "Oblasť sa zahodí. Nič pod ňou nevisí, takže sa nič neodpojí. Späť sa to vrátiť nedá."}
              </DialogDescription>
              <DialogDescription>
                Ak ide len o to, že oblasť práve nepoužívaš, zavri dialóg
                a archivuj — archivovaná oblasť sa neponúka vo výberoch, ale
                všetko pod ňou ostáva na svojom mieste a dá sa vrátiť späť.
              </DialogDescription>
            </DialogHeader>

            {/* Chyba sa sem už nevykresľuje: dialóg sa zatvára hneď pri
                potvrdení a odpoveď servera zachytáva zoznam nad riadkami. */}
            <DialogFooter>
              <Button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={isPending}
                className="h-11 sm:h-9"
              >
                Zrušiť
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={remove}
                disabled={isPending}
                className="h-11 sm:h-9"
              >
                {isPending ? (
                  <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
                ) : (
                  <Trash2 aria-hidden="true" size={15} />
                )}
                Áno, zmazať oblasť
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </li>
  );
}
