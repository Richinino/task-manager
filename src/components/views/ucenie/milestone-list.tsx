"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { addMilestones, deleteMilestone, toggleMilestone } from "@/server/actions/learning";

import { focusOnMount } from "./focus-on-mount";
import type { MilestoneItem } from "./learning-types";

/* ═══════════════════════════════════════════════════════════════════════════
   MÍĽNIKY ZRUČNOSTI

   Míľnik je **overiteľná veta**, nie číslo úrovne: „otvoriť zámok s dvomi
   bezpečnostnými pinmi", nie „level 3". Je to tá istá myšlienka ako
   „definícia hotovo" pri projekte — musí sa to dať overiť, nie len cítiť.

   Odškrtnutie sa deje hneď a veta „ako to vieš" sa pýta až po ňom. Poradie je
   dôležité: keby najprv pýtalo vetu, míľnik by ostal neodškrtnutý zakaždým,
   keď sa človeku nechce písať — a to je práve ten okamih, keď sa sekcia
   prestane používať.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface MilestoneListProps {
  skillId: string;
  milestones: readonly MilestoneItem[];
}

export function MilestoneList({ skillId, milestones }: MilestoneListProps) {
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addFromText(): void {
    const text = paste.trim();
    if (text === "" || isPending) return;

    setError(null);
    startTransition(async () => {
      const result = await addMilestones(skillId, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPaste("");
      setShowPaste(false);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {milestones.length === 0 ? (
        <p className="text-mini text-fg-muted">
          Zatiaľ bez míľnikov. Bez nich sa dá zbierať čas, ale nie postup —
          hodnosť je podiel dosiahnutých ku všetkým.
        </p>
      ) : (
        <ul className="flex flex-col">
          {milestones.map((milestone) => (
            <MilestoneRow key={milestone.id} milestone={milestone} />
          ))}
        </ul>
      )}

      {showPaste ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            rows={5}
            ref={focusOnMount}
            aria-label="Míľniky, jeden na riadok"
            placeholder={"Jeden míľnik na riadok.\nOdrážky aj číslovanie sa odstrihnú."}
          />

          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={addFromText} disabled={isPending}>
              {isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              Pridať
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowPaste(false);
                setError(null);
              }}
            >
              Zrušiť
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="self-start"
          onClick={() => setShowPaste(true)}
        >
          <Plus className="size-3.5" />
          Prilepiť míľniky
        </Button>
      )}

      {error ? <p className="text-mini text-danger">{error}</p> : null}
    </div>
  );
}

/**
 * Jeden míľnik.
 *
 * Po odškrtnutí sa pod ním otvorí riadok na vetu „ako to vieš". Nie je
 * povinná — kto ju nenapíše, má míľnik odškrtnutý rovnako. O rok je z tých
 * viet čitateľná história namiesto radu odškrtnutých políčok.
 */
function MilestoneRow({ milestone }: { milestone: MilestoneItem }) {
  const reached = milestone.reachedAt !== null;
  const [evidence, setEvidence] = useState(milestone.evidence ?? "");
  const [asking, setAsking] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle(next: boolean): void {
    startTransition(async () => {
      await toggleMilestone(milestone.id, next, next ? evidence : undefined);
      if (next) setAsking(milestone.evidence === null);
      else {
        setAsking(false);
        setEvidence("");
      }
    });
  }

  function saveEvidence(): void {
    startTransition(async () => {
      await toggleMilestone(milestone.id, true, evidence);
      setAsking(false);
    });
  }

  return (
    <li className="group flex flex-col gap-1 border-b border-border/60 py-1.5 last:border-b-0">
      <div className="flex min-w-0 items-start gap-2">
        <Checkbox
          checked={reached}
          onCheckedChange={(value) => toggle(value === true)}
          disabled={isPending}
          aria-label={milestone.title}
          className="mt-[3px]"
        />

        <button
          type="button"
          onClick={() => reached && setAsking((open) => !open)}
          className={cn(
            "min-w-0 flex-1 text-left text-body leading-snug",
            reached ? "text-fg-muted line-through decoration-fg-subtle" : "text-fg",
            reached ? "cursor-pointer" : "cursor-default",
          )}
        >
          {milestone.title}
        </button>

        <button
          type="button"
          aria-label={`Zmazať míľnik ${milestone.title}`}
          onClick={() =>
            startTransition(async () => {
              await deleteMilestone(milestone.id);
            })
          }
          className="mt-[2px] shrink-0 text-fg-subtle opacity-0 transition-opacity duration-100 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {reached && !asking && milestone.evidence ? (
        <p className="pl-6 text-mini italic text-fg-muted">{milestone.evidence}</p>
      ) : null}

      {reached && asking ? (
        <div className="flex items-center gap-2 pl-6">
          <Input
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveEvidence();
              if (event.key === "Escape") setAsking(false);
            }}
            onBlur={saveEvidence}
            maxLength={500}
            ref={focusOnMount}
            aria-label="Ako to vieš?"
            placeholder="Ako to vieš? (nepovinné)"
            className="h-8 text-mini"
          />
        </div>
      ) : null}
    </li>
  );
}
