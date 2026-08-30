"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ═══════════════════════════════════════════════════════════════════════════
   ARCHÍV A MAZANIE

   Jedno ovládanie pre pilier aj zručnosť — je to tá istá dvojica volieb
   a druhá kópia by sa časom rozišla s prvou.

   **Archivovať je predvolená cesta preč.** Vec, ktorej sa už nevenuješ, nie
   je vec, ktorá sa nikdy nestala: archivovaný pilier zmizne z ponúk, ale
   lekcie, ktoré doň padli, ostávajú a dajú sa vrátiť. Mazanie je pre druhý
   prípad — „toto nemalo nikdy vzniknúť" — a preto si pýta potvrdenie
   a hovorí rovno, čo sa stratí.
   ═══════════════════════════════════════════════════════════════════════════ */

type Result = { ok: true } | { ok: false; error: string };

export interface LearningControlsProps {
  /** „pilier" alebo „zručnosť" — do popiskov aj do dialógu. */
  kind: "pilier" | "zručnosť";
  name: string;
  archived: boolean;
  onArchive: (archived: boolean) => Promise<Result>;
  onDelete: () => Promise<Result>;
  /** Veta o tom, čo sa zmazaním stratí. Musí byť pravdivá, nie strašidelná. */
  deleteWarning: string;
  onError: (message: string) => void;
}

export function LearningControls({
  kind,
  name,
  archived,
  onArchive,
  onDelete,
  deleteWarning,
  onError,
}: LearningControlsProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const rod = kind === "pilier" ? "Archivovaný" : "Archivovaná";

  return (
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
        disabled={isPending}
        aria-label={
          archived
            ? `Vrátiť ${kind} ${name} z archívu`
            : `Archivovať ${kind} ${name}`
        }
        title={
          archived
            ? "Vrátiť z archívu"
            : `Archivovať — ${kind} sa schová z ponúk, lekcie ostanú`
        }
        onClick={() =>
          startTransition(async () => {
            const result = await onArchive(!archived);
            if (!result.ok) onError(result.error);
          })
        }
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
        disabled={isPending}
        aria-label={`Zmazať ${kind} ${name}`}
        title={`Zmazať — ${kind} sa zahodí`}
        className="size-11 text-danger hover:bg-danger/10 hover:text-danger sm:size-8"
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 aria-hidden="true" size={15} />
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        {confirmOpen ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Zmazať {kind} „{name}“?
              </DialogTitle>
              <DialogDescription>{deleteWarning}</DialogDescription>
              <DialogDescription>
                Ak ide len o to, že sa tomu práve nevenuješ, zavri dialóg
                a archivuj. {rod} {kind} sa neponúka pri úlohách, ale všetko
                pod ňou ostáva a dá sa vrátiť späť.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button type="button" onClick={() => setConfirmOpen(false)}>
                Zrušiť
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={isPending}
                onClick={() => {
                  setConfirmOpen(false);
                  startTransition(async () => {
                    const result = await onDelete();
                    if (!result.ok) onError(result.error);
                  });
                }}
              >
                Zmazať
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
