"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { archiveProject, deleteProject } from "@/server/actions/structure";

import { taskCountLabel } from "./project-card";

/* ═══════════════════════════════════════════════════════════════════════════
   ARCHIVOVAŤ ALEBO ZMAZAŤ

   Sú to dve úplne rôzne veci a rozdiel medzi nimi si nikto nedomyslí:

   • archivácia projekt schová z výberov, ale úlohy aj históriu nechá tak,
     ako sú — a dá sa vrátiť späť;
   • mazanie projekt zahodí a jeho úlohám odpojí príslušnosť. Úlohy prežijú,
     ale už nebudú vedieť, kam patrili.

   Preto je to napísané pri každom tlačidle, nie len v potvrdení. Mazanie
   navyše musí prejsť dialógom — je to jediná nevratná akcia na obrazovke.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ProjectDangerZoneProps {
  projectId: string;
  projectName: string;
  archived: boolean;
  /** Koľko úloh sa zmazaním odpojí — bez čísla je varovanie prázdne slovo. */
  taskCount: number;
}

export function ProjectDangerZone({
  projectId,
  projectName,
  archived,
  taskCount,
}: ProjectDangerZoneProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleArchive(): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await archiveProject(projectId, !archived);
        if (!result.ok) setError(result.error);
      } catch {
        setError("Zmenu sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  function remove(): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteProject(projectId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // Detail zmazaného projektu už neexistuje — ostať na ňom by znamenalo
        // pozerať sa na 404. `replace`, aby sa naň nedalo vrátiť tlačidlom späť.
        setConfirmOpen(false);
        router.replace("/projekty");
      } catch {
        setError("Projekt sa nepodarilo zmazať. Skús to znova.");
      }
    });
  }

  return (
    <section aria-labelledby="sprava-projektu" className="flex flex-col gap-3">
      <h2
        id="sprava-projektu"
        className="label text-fg-subtle"
      >
        Správa projektu
      </h2>

      {error !== null ? (
        <p
          role="alert"
          className="rounded border border-danger bg-surface px-3 py-2 text-body font-medium text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 rounded border border-border bg-surface p-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-fg">
            {archived ? "Vrátiť z archívu" : "Archivovať"}
          </p>
          <p className="mt-0.5 text-meta leading-relaxed text-fg-muted">
            {archived
              ? "Projekt sa vráti medzi živé a znovu sa začne ponúkať vo výberoch."
              : "Projekt sa schová z výberov a z parsera, ale úlohy aj história ostanú nedotknuté. Kedykoľvek sa dá vrátiť späť."}
          </p>
        </div>
        <Button
          type="button"
          onClick={toggleArchive}
          disabled={isPending}
          className="h-11 w-full shrink-0 sm:h-9 sm:w-auto"
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
          ) : archived ? (
            <ArchiveRestore aria-hidden="true" size={15} />
          ) : (
            <Archive aria-hidden="true" size={15} />
          )}
          {archived ? "Vrátiť z archívu" : "Archivovať"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded border border-border bg-surface p-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-fg">Zmazať projekt</p>
          <p className="mt-0.5 text-meta leading-relaxed text-fg-muted">
            Projekt sa zahodí, jeho úlohy nie —{" "}
            {taskCount === 0
              ? "len stratia príslušnosť k projektu a ostanú visieť samostatne."
              : `${taskCountLabel(taskCount)} stratí príslušnosť k projektu a ostane visieť samostatne.`}{" "}
            Späť sa to vrátiť nedá. Ak chceš len upratať zoznam, archivuj.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          className={cn(
            "h-11 w-full shrink-0 text-danger sm:h-9 sm:w-auto",
            "hover:bg-danger/10 hover:text-danger",
          )}
        >
          <Trash2 aria-hidden="true" size={15} />
          Zmazať
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        {confirmOpen ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Zmazať projekt „{projectName}“?</DialogTitle>
              <DialogDescription>
                {taskCount === 0
                  ? "Projekt sa zahodí, jeho úlohy nie — tie sa od neho len odpoja. Späť sa to vrátiť nedá."
                  : `Projekt sa zahodí a ${taskCountLabel(taskCount)} sa od neho odpojí — úlohy ostanú, ale bez projektu. Späť sa to vrátiť nedá.`}
              </DialogDescription>
              <DialogDescription>
                Ak ide len o to, že projekt je vybavený a prekáža v zozname,
                zavri dialóg a použi archiváciu — tá projekt aj históriu zachová.
              </DialogDescription>
            </DialogHeader>

            {/* Chyba sa musí ukázať aj tu — hláška pod dialógom je prekrytá
                závojom a používateľ by videl len tlačidlo, ktoré „nič nerobí". */}
            {error !== null ? (
              <p
                role="alert"
                className="rounded border border-danger bg-surface px-3 py-2 text-body font-medium text-danger"
              >
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={isPending}
              >
                Zrušiť
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={remove}
                disabled={isPending}
              >
                {isPending ? (
                  <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
                ) : (
                  <Trash2 aria-hidden="true" size={15} />
                )}
                Áno, zmazať projekt
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}
