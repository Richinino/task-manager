"use client";

import { useOptimistic, useState } from "react";
import { Archive, ChevronDown, ChevronRight, Layers } from "lucide-react";

import { cn } from "@/lib/utils";
import { TaskEmpty } from "@/components/task/task-empty";
import type { AreaWithCounts } from "@/server/queries/structure";

import { AreaCreateForm } from "./area-create-form";
import { AreaRow } from "./area-row";

/* ═══════════════════════════════════════════════════════════════════════════
   ZOZNAM OBLASTÍ

   Jednoduchšie ako projekty a zámerne: oblasť nemá detail, na ktorý by sa
   dalo prekliknúť. Všetko, čo sa s ňou dá spraviť, je v jej riadku.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Stabilné referencie, aby sa optimistický stav po akcii vrátil na prázdno. */
const NOTHING_PENDING: readonly string[] = [];
const NOTHING_REMOVED: readonly string[] = [];

export interface AreaListProps {
  active: AreaWithCounts[];
  archived: AreaWithCounts[];
}

export function AreaList({ active, archived }: AreaListProps) {
  /* Práve zakladané oblasti — riadok sa vykreslí bez čakania na server. */
  const [pending, addPending] = useOptimistic<readonly string[], string>(
    NOTHING_PENDING,
    (state, name) => [...state, name],
  );

  /* Práve archivované alebo mazané — z pásma, v ktorom stoja, miznú hneď. */
  const [removed, markRemoved] = useOptimistic<readonly string[], string>(
    NOTHING_REMOVED,
    (state, id) => (state.includes(id) ? state : [...state, id]),
  );

  const [archiveOpen, setArchiveOpen] = useState(false);

  /*
    Chyba archivácie a mazania patrí sem, nie do riadku: riadok sa pri týchto
    dvoch akciách odmontuje skôr, než odpoveď dorazí, takže hláška vykreslená
    v ňom by nemala kde vzniknúť — používateľ by videl len to, že oblasť
    zmizla a zase sa vrátila, bez vysvetlenia.
  */
  const [error, setError] = useState<string | null>(null);

  const visibleActive = active.filter((area) => !removed.includes(area.id));
  const visibleArchived = archived.filter((area) => !removed.includes(area.id));

  const usedColors = [...active, ...archived].map((area) => area.color);
  const nothingAtAll =
    visibleActive.length === 0 && visibleArchived.length === 0 && pending.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <AreaCreateForm usedColors={usedColors} onOptimisticAdd={addPending} />

      {error !== null ? (
        <p role="status" className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {nothingAtAll ? (
        <TaskEmpty
          icon={<Layers size={26} strokeWidth={1.75} />}
          title="Zatiaľ žiadna oblasť"
          description="Oblasti sú okruhy, medzi ktoré sa delí celý život: zdravie, financie, práca, domácnosť, vzťahy. Neplnia sa a nekončia — len držia úlohy pokope a dávajú im farbu. Ak má vec cieľ a koniec, patrí do projektu, nie sem."
          className="text-left sm:text-center"
        />
      ) : (
        <section aria-labelledby="aktivne-oblasti" className="flex flex-col gap-2">
          <h2 id="aktivne-oblasti" className="sr-only">
            Aktívne oblasti
          </h2>

          <ul className="flex flex-col gap-2">
            {pending.map((name) => (
              <li
                key={`pending-${name}`}
                aria-hidden="true"
                className="min-w-0 rounded border border-dashed border-border bg-surface px-3 py-3 opacity-60"
              >
                <span className="block min-w-0 truncate text-sm font-medium text-fg">
                  {name}
                </span>
                <span className="text-[11px] text-fg-subtle">zakladá sa…</span>
              </li>
            ))}

            {visibleActive.map((area) => (
              <AreaRow
                key={area.id}
                area={area}
                onOptimisticRemove={markRemoved}
                onError={setError}
              />
            ))}
          </ul>

          {visibleActive.length === 0 && pending.length === 0 ? (
            <p className="rounded border border-dashed border-border bg-surface px-3 py-4 text-sm text-fg-muted">
              Žiadna živá oblasť — všetko, čo tu bolo, je v archíve.
            </p>
          ) : null}
        </section>
      )}

      {visibleArchived.length > 0 ? (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setArchiveOpen((open) => !open)}
            aria-expanded={archiveOpen}
            aria-controls="archivovane-oblasti"
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
              Archív — {visibleArchived.length}
            </span>
          </button>

          <div id="archivovane-oblasti" hidden={!archiveOpen} className="flex flex-col gap-2">
            <ul className="flex flex-col gap-2">
              {visibleArchived.map((area) => (
                <AreaRow
                key={area.id}
                area={area}
                onOptimisticRemove={markRemoved}
                onError={setError}
              />
              ))}
            </ul>
            <p className="px-1 text-[11px] leading-relaxed text-fg-subtle">
              Archivovaná oblasť sa neponúka vo výberoch, ale úlohy aj projekty
              pod ňou ostávajú tam, kde boli. Vrátiť ju späť sa dá jedným ťuknutím.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
