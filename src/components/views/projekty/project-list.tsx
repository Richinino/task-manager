"use client";

import { useOptimistic, useState } from "react";
import { Archive, ChevronDown, ChevronRight, FolderPlus } from "lucide-react";

import type { Area } from "@/db/schema";
import { cn } from "@/lib/utils";
import { TaskEmpty } from "@/components/task/task-empty";
import type { ProjectWithCounts } from "@/server/queries/structure";

import { ProjectCard } from "./project-card";
import { ProjectCreateForm } from "./project-create-form";
import { projectCountLabel } from "./projects-header";

/* ═══════════════════════════════════════════════════════════════════════════
   ZOZNAM PROJEKTOV

   Tri pásma pod sebou: formulár, živé projekty, archív. Archív je zbalený —
   je to pamäť, nie zoznam na prácu; keby bol rozbalený, po pol roku by živé
   projekty tlačil pod okraj obrazovky.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Stabilná referencia, aby sa optimistický stav po dobehnutí akcie vrátil na prázdno. */
const NOTHING_PENDING: readonly string[] = [];

export interface ProjectListProps {
  /** Neaktivované projekty, zoradené serverom. */
  active: ProjectWithCounts[];
  archived: ProjectWithCounts[];
  /** Aktívne oblasti do výberu vo formulári. */
  areas: Area[];
  /** Dnešok z pásma používateľa — karty si ho nikdy nepočítajú samy. */
  todayIso: string;
}

export function ProjectList({ active, archived, areas, todayIso }: ProjectListProps) {
  /*
    Práve zakladané projekty. Kartu vykreslíme hneď, bez čakania na server;
    keď akcia dobehne, React sa vráti k dátam zo servera — pri úspechu tam
    projekt už je, pri chybe zmizne a formulár povie prečo.
  */
  const [pending, addPending] = useOptimistic<readonly string[], string>(
    NOTHING_PENDING,
    (state, name) => [...state, name],
  );

  const [archiveOpen, setArchiveOpen] = useState(false);

  const nothingAtAll =
    active.length === 0 && archived.length === 0 && pending.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <ProjectCreateForm areas={areas} onOptimisticAdd={addPending} />

      {nothingAtAll ? (
        <TaskEmpty
          icon={<FolderPlus size={26} strokeWidth={1.75} />}
          title="Zatiaľ žiadny projekt"
          description="Projekt zoskupuje úlohy, ktoré majú spoločný cieľ a koniec — presťahovanie, rekonštrukcia, kurz. Keď je cieľ splnený, projekt sa zavrie. Okruh, ktorý sa len udržiava a nikdy nekončí — zdravie, financie, domácnosť — nie je projekt, ale oblasť."
          className="text-left sm:text-center"
        />
      ) : (
        <section aria-labelledby="aktivne-projekty" className="flex flex-col gap-2">
          <h2 id="aktivne-projekty" className="sr-only">
            Aktívne projekty
          </h2>

          {pending.map((name) => (
            <PendingCard key={`pending-${name}`} name={name} />
          ))}

          {active.map((project) => (
            <ProjectCard key={project.id} project={project} todayIso={todayIso} />
          ))}

          {active.length === 0 && pending.length === 0 ? (
            <p className="rounded border border-dashed border-border bg-surface px-3 py-4 text-sm text-fg-muted">
              Žiadny živý projekt — všetko, čo tu bolo, je v archíve.
            </p>
          ) : null}
        </section>
      )}

      {archived.length > 0 ? (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setArchiveOpen((open) => !open)}
            aria-expanded={archiveOpen}
            aria-controls="archivovane-projekty"
            className={cn(
              "inline-flex h-11 w-full items-center gap-2 rounded px-1 text-left sm:h-8",
              "text-[13px] font-medium text-fg-muted",
              "transition-colors duration-100 ease-out hover:bg-surface-2 hover:text-fg",
            )}
          >
            {archiveOpen ? (
              <ChevronDown aria-hidden="true" size={15} className="shrink-0" />
            ) : (
              <ChevronRight aria-hidden="true" size={15} className="shrink-0" />
            )}
            <Archive aria-hidden="true" size={14} className="shrink-0 text-fg-subtle" />
            <span className="min-w-0 truncate">
              Archív — {projectCountLabel(archived.length)}
            </span>
          </button>

          <div
            id="archivovane-projekty"
            hidden={!archiveOpen}
            className="flex flex-col gap-2"
          >
            {archived.map((project) => (
              <ProjectCard key={project.id} project={project} todayIso={todayIso} />
            ))}
            <p className="px-1 text-[11px] leading-relaxed text-fg-subtle">
              Archivovaný projekt sa neponúka vo výberoch, ale jeho úlohy aj
              história ostávajú. Z detailu sa dá kedykoľvek vrátiť späť.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Karta projektu, ktorý sa práve zakladá.
 *
 * Nemá odkaz — kým server nevráti identifikátor, nie je kam kliknúť,
 * a odkaz, ktorý nikam nevedie, je horší než žiadny.
 */
function PendingCard({ name }: { name: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex min-w-0 flex-col gap-2 rounded border border-dashed border-border bg-surface px-3 py-2.5 opacity-60"
    >
      <span className="min-w-0 truncate text-sm font-medium text-fg">{name}</span>
      <span className="text-xs text-fg-subtle">zakladá sa…</span>
    </div>
  );
}
