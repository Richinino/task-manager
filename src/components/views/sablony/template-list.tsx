"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { LayoutTemplate, Plus } from "lucide-react";

import { TaskEmpty } from "@/components/task/task-empty";
import { Button } from "@/components/ui/button";
import { deleteTemplate } from "@/server/actions/templates";
import type { TemplateSummary } from "@/server/queries/templates";

import { ApplyDialog } from "./apply-dialog";
import { TemplateCard } from "./template-card";
import { TemplateEditor } from "./template-editor";
import { tasksAppeared } from "./template-labels";

/* ═══════════════════════════════════════════════════════════════════════════
   ZOZNAM ŠABLÓN

   Editor sa otvára NA MIESTE karty, nie v dialógu. Úprava predpisu je práca
   so zoznamom riadkov, pri ktorej sa človek pozerá aj na ostatné šablóny —
   dialóg by mu ich zakryl a na telefóne by z ôsmich riadkov spravil skrolovacie
   okno v skrolovacom okne.

   V dialógu je naopak POUŽITIE: tam ide o jedno rozhodnutie (ktorý deň) a
   o následok, ktorý treba vidieť celý, bez ostatného obsahu okolo.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Čo je práve otvorené v režime úprav. */
type EditMode =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; templateId: string };

/** Tiché potvrdenie samo zmizne — zatvárať sa nedá, lebo netreba. */
const FLASH_MS = 6000;

export interface TemplateListProps {
  templates: TemplateSummary[];
  /** Dnešok v pásme používateľa. Klient si ho nikdy nepočíta sám. */
  todayIso: string;
}

export function TemplateList({ templates, todayIso }: TemplateListProps) {
  /*
    Zmazaná šablóna musí z obrazovky zmiznúť hneď, nie až keď sa vráti nové
    vykreslenie zo servera. Optimistický stav ju odoberie a pri zlyhaní sa
    zoznam po dobehnutí tranzície vráti do pôvodného tvaru sám.
  */
  const [visible, removeOptimistically] = useOptimistic(
    templates,
    (state, removedId: string) => state.filter((item) => item.id !== removedId),
  );

  const [mode, setMode] = useState<EditMode>({ kind: "none" });
  const [applying, setApplying] = useState<TemplateSummary | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (flash === null) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    if (error === null) return;
    const timer = window.setTimeout(() => setError(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  function announce(message: string): void {
    setError(null);
    setFlash(message);
  }

  function remove(template: TemplateSummary): void {
    setError(null);
    setFlash(null);
    setBusyId(template.id);

    startTransition(async () => {
      removeOptimistically(template.id);
      try {
        const result = await deleteTemplate(template.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setFlash(`Šablóna „${template.name}“ je zmazaná.`);
      } catch {
        setError("Šablónu sa nepodarilo zmazať. Skús to znova.");
      } finally {
        setBusyId(null);
      }
    });
  }

  const creating = mode.kind === "create";
  const nothingAtAll = visible.length === 0 && !creating;

  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <TemplateEditor
          template={null}
          onCancel={() => setMode({ kind: "none" })}
          onSaved={(message) => {
            setMode({ kind: "none" });
            announce(message);
          }}
        />
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={() => setMode({ kind: "create" })}
          >
            <Plus aria-hidden="true" size={15} />
            Nová šablóna
          </Button>
        </div>
      )}

      {error !== null ? (
        <p
          role="alert"
          className="rounded border border-danger bg-surface px-3 py-2 text-body font-medium break-words text-danger"
        >
          {error}
        </p>
      ) : null}

      {/* Oblasť je pripojená stále — čítačka ohlási len tú, ktorá už v DOM
          bola, keď sa jej obsah zmení. */}
      <div role="status" aria-live="polite">
        {flash !== null ? (
          <p className="min-w-0 break-words rounded border border-border bg-surface-2 px-3 py-2 text-body text-fg-muted">
            {flash}
          </p>
        ) : null}
      </div>

      {nothingAtAll ? (
        <TaskEmpty
          icon={<LayoutTemplate size={26} strokeWidth={1.75} />}
          title="Zatiaľ žiadna šablóna"
          description="Šablóna je predpis na vec, ktorú robíš opakovane — ranná rutina, uzávierka mesiaca, príprava na cestu. Nie je to kópia existujúcich úloh: napíšeš, čo má vzniknúť a s akým posunom dňa, a potom to jedným ťuknutím vysypeš do ľubovoľného dňa. Šablóna sa preto nerozbije tým, že niektorú z pôvodných úloh zmažeš."
          className="text-left sm:text-center"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((template) =>
            mode.kind === "edit" && mode.templateId === template.id ? (
              <li key={template.id} className="min-w-0">
                <TemplateEditor
                  template={template}
                  onCancel={() => setMode({ kind: "none" })}
                  onSaved={(message) => {
                    setMode({ kind: "none" });
                    announce(message);
                  }}
                />
              </li>
            ) : (
              <TemplateCard
                key={template.id}
                template={template}
                busy={busyId === template.id}
                onApply={() => setApplying(template)}
                onEdit={() => setMode({ kind: "edit", templateId: template.id })}
                onDelete={() => remove(template)}
              />
            ),
          )}
        </ul>
      )}

      <ApplyDialog
        template={applying}
        todayIso={todayIso}
        onClose={() => setApplying(null)}
        onApplied={(created, templateName) => {
          setApplying(null);
          announce(
            created === 0
              ? `Zo šablóny „${templateName}“ nevznikla ani jedna úloha.`
              : `Zo šablóny „${templateName}“ ${tasksAppeared(created)}.`,
          );
        }}
      />
    </div>
  );
}
