"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { promoteIdeaToProject, updateIdea } from "@/server/actions/ideas";
import type { IdeaWithRelations } from "@/server/queries/ideas";

/* ═══════════════════════════════════════════════════════════════════════════
   POVÝŠENIE NÁPADU NA PROJEKT

   Jadro celého míľnika, a preto to nie je len tlačidlo. Povýšenie zakladá
   projekt aj jeho prvú úlohu — je to jediné miesto v appke, kde jedno
   kliknutie vyrobí dve nové veci. Kto nevie, čo vznikne, buď klikne a bude
   prekvapený, alebo neklikne vôbec.

   Dialóg preto najprv vymenuje, čo sa stane, potom to spraví a nakoniec ukáže,
   čo vzniklo, aj s odkazom.

   Chýbajúci `nextStep` sa rieši TU, nie mlčaním: serverová akcia z neho robí
   prvú úlohu projektu, takže bez neho vznikne prázdny projekt a človek o týždeň
   nevie, kde začať. Presne v tom stave nápady zapadnú prachom.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PromoteDialogProps {
  /** Nápad na povýšenie; `null` znamená zatvorený dialóg. */
  idea: IdeaWithRelations | null;
  onClose: () => void;
  /** Oznámi doske, že povýšenie prebehlo — na tiché potvrdenie nad zoznamom. */
  onPromoted: (title: string) => void;
}

export function PromoteDialog({ idea, onClose, onPromoted }: PromoteDialogProps) {
  return (
    <Dialog
      open={idea !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {idea !== null ? (
        <DialogContent>
          {/* Kľúč resetuje rozpísaný prvý krok pri prepnutí na iný nápad —
              inak by sa text z jedného nápadu ponúkol druhému. */}
          <PromoteBody key={idea.id} idea={idea} onClose={onClose} onPromoted={onPromoted} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

interface PromoteBodyProps {
  idea: IdeaWithRelations;
  onClose: () => void;
  onPromoted: (title: string) => void;
}

function PromoteBody({ idea, onClose, onPromoted }: PromoteBodyProps) {
  const name = idea.title.trim();
  const goal = idea.body?.trim() ?? "";
  const originalStep = idea.nextStep?.trim() ?? "";

  const [nextStep, setNextStep] = useState(originalStep);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ projectId: string; firstTask: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const step = nextStep.trim();
  const missingStep = step === "";

  function promote(): void {
    if (isPending || created !== null) return;
    setError(null);

    startTransition(async () => {
      try {
        /*
          Doplnený krok sa musí uložiť pred povýšením: `promoteIdeaToProject`
          si `nextStep` číta z databázy, nie z parametra. Sú to dve volania,
          nie jedna transakcia — ak by zlyhalo povýšenie, krok ostane uložený
          pri nápade, čo je neškodné a druhý pokus na ňom postaví.
        */
        if (step !== originalStep) {
          const saved = await updateIdea(idea.id, { nextStep: step });
          if (!saved.ok) {
            setError(saved.error);
            return;
          }
        }

        const result = await promoteIdeaToProject(idea.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }

        setCreated({ projectId: result.data.projectId, firstTask: step });
        onPromoted(name);
      } catch {
        setError("Nápad sa nepodarilo povýšiť. Skús to znova.");
      }
    });
  }

  if (created !== null) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <CircleCheck aria-hidden="true" size={16} className="shrink-0 text-success" />
            <span className="min-w-0 break-words">Vznikol projekt „{name}"</span>
          </DialogTitle>
          <DialogDescription>Toto sa práve založilo:</DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-fg-muted">
          <li className="min-w-0 break-words">
            <span className="font-medium text-fg">Projekt „{name}"</span>
            {goal !== "" ? " — s cieľom prevzatým z popisu nápadu." : " — zatiaľ bez cieľa."}
          </li>
          <li className="min-w-0 break-words">
            {created.firstTask !== "" ? (
              <>
                <span className="font-medium text-fg">Prvá úloha: „{created.firstTask}"</span>{" "}
                — čaká v horizonte týždeň, bez konkrétneho dňa.
              </>
            ) : (
              <>
                Projekt <span className="font-medium text-fg">zatiaľ nemá žiadnu úlohu</span>{" "}
                — prvú si doplň v jeho detaile, inak sa nepohne.
              </>
            )}
          </li>
          <li className="min-w-0 break-words">
            Nápad ostáva v zozname ako povýšený — nech je vidieť, z čoho projekt vznikol.
          </li>
        </ul>

        <DialogFooter>
          <Button type="button" onClick={onClose} className="h-11 sm:h-9">
            Zavrieť
          </Button>
          <Link
            href={`/projekty/${created.projectId}`}
            className={cn(
              "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded border border-transparent px-3 sm:h-9",
              "bg-accent text-sm font-medium text-accent-fg",
              "transition-colors duration-100 ease-out hover:bg-accent/90",
            )}
          >
            Otvoriť projekt
          </Link>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="min-w-0 break-words">
          Povýšiť „{name}" na projekt?
        </DialogTitle>
        <DialogDescription>
          Nápad je možnosť, projekt je záväzok. Povýšením sa rozhoduješ, že to
          naozaj spravíš — nápad sa nezmaže, ostane v zozname ako jeho pôvod.
        </DialogDescription>
      </DialogHeader>

      <ul className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-fg-muted">
        <li className="min-w-0 break-words">
          Vznikne projekt <span className="font-medium text-fg">„{name}"</span> —
          názov sa berie z nápadu. Ak už taký projekt máš, povýšenie sa zastaví
          a nápad bude treba premenovať.
        </li>
        <li className="min-w-0 break-words">
          {goal !== ""
            ? "Cieľom projektu bude popis nápadu."
            : "Projekt zatiaľ nebude mať cieľ — nápad nemá popis."}
        </li>
        <li className="min-w-0 break-words">
          {idea.area
            ? `Projekt zdedí oblasť ${idea.area.name}.`
            : "Projekt bude bez oblasti — nápad žiadnu nemá."}
        </li>
      </ul>

      {missingStep ? (
        <div
          className={cn(
            "mt-3 flex min-w-0 gap-2 rounded border border-warn/50 bg-surface-2 px-3 py-2.5",
            "text-[13px] leading-relaxed text-fg-muted",
          )}
        >
          <CircleAlert aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-warn" />
          <p className="min-w-0">
            <span className="font-medium text-fg">Nápad nemá ďalší krok.</span> Práve
            z neho vzniká prvá úloha projektu. Bez nej založíš prázdny projekt,
            v ktorom o týždeň nebudeš vedieť, kde začať — doplň ho rovno tu.
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-1.5">
        <label htmlFor="povysenie-prvy-krok" className="text-[12px] font-medium text-fg-muted">
          Prvý krok projektu
        </label>
        <Input
          id="povysenie-prvy-krok"
          value={nextStep}
          maxLength={500}
          autoComplete="off"
          autoFocus={missingStep}
          placeholder="Najmenšia vec, ktorou sa to dá pohnúť"
          onChange={(event) => {
            setNextStep(event.target.value);
            if (error !== null) setError(null);
          }}
          // 16 px pod `sm`: menšie písmo si mobilné prehliadače vysvetlia
          // ako „toto sa nedá prečítať" a stránku pri fokuse priblížia.
        />
        <p className="text-[11px] leading-relaxed text-fg-subtle">
          Uloží sa k nápadu a hneď z neho vznikne prvá úloha projektu — stav
          „urobiť", horizont týždeň.
        </p>
      </div>

      <div role="alert" aria-live="polite" className="min-w-0">
        {error !== null ? (
          <p className="mt-3 text-[13px] font-medium break-words text-danger">{error}</p>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" onClick={onClose} disabled={isPending} className="h-11 sm:h-9">
          Zrušiť
        </Button>
        <Button
          type="button"
          // Bez prvého kroku sa povýšiť dá — je to rozhodnutie človeka, nie
          // chyba. Tlačidlo to ale pomenuje, aby to nebolo omylom.
          variant={missingStep ? "secondary" : "primary"}
          onClick={promote}
          disabled={isPending}
          className="h-11 sm:h-9"
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
          ) : (
            <Rocket aria-hidden="true" size={15} />
          )}
          {missingStep ? "Povýšiť bez prvého kroku" : "Povýšiť na projekt"}
        </Button>
      </DialogFooter>
    </>
  );
}
