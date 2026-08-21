"use client";

import { useId, useState, useTransition } from "react";
import { LoaderCircle, Plus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createTemplate, updateTemplate } from "@/server/actions/templates";
import type { TemplateSummary, TemplateTask } from "@/server/queries/templates";

import { taskCountLabel } from "./template-labels";
import {
  TemplateTaskRow,
  draftToTemplateTask,
  newTaskDraft,
  taskDraftFrom,
  type TaskDraft,
} from "./template-task-row";

/* ═══════════════════════════════════════════════════════════════════════════
   EDITOR ŠABLÓNY

   Ten istý formulár zakladá aj upravuje. Rozdiel je jediný — či prišla
   existujúca šablóna — a rozdvojiť ho do dvoch komponentov by znamenalo dve
   miesta, kde sa dá zabudnúť na nové pole.

   Riadky sa pri ukladaní posielajú VŽDY všetky naraz, nie po jednom. Poradie
   krokov je súčasť predpisu („zohriať vodu" pred „zaliať kávu") a dopĺňať
   jednotlivé riadky by znamenalo posielať poradie osobitne — teda mať dva
   zdroje pravdy o tej istej veci.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Strop z `MAX_TEMPLATE_TASKS`. Väčší predpis už nie je rutina, ale projekt.
 *
 * Číslo je tu opísané, nie importované: konštanta žije v module s
 * `server-only` a hodnotový import by ju vtiahol do klientskeho balíka, čo
 * preklad zastaví. Tvrdú hranicu drží aj tak server — toto je len to, aby sa
 * o nej človek dozvedel skôr, než formulár odošle.
 */
const MAX_ROWS = 30;

export interface TemplateEditorProps {
  /** Šablóna na úpravu; `null` znamená zakladanie novej. */
  template: TemplateSummary | null;
  onCancel: () => void;
  /** Oznámi zoznamu, že zápis prešiel — na tiché potvrdenie nad kartami. */
  onSaved: (message: string) => void;
}

export function TemplateEditor({ template, onCancel, onSaved }: TemplateEditorProps) {
  const [name, setName] = useState(() => template?.name ?? "");
  const [description, setDescription] = useState(() => template?.description ?? "");
  const [rows, setRows] = useState<TaskDraft[]>(() =>
    template === null || template.tasks.length === 0
      ? [newTaskDraft()]
      : template.tasks.map(taskDraftFrom),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ids = useId();
  const fieldId = (field: string): string => `${ids}-${field}`;

  const trimmedName = name.trim();
  const isNew = template === null;

  /*
    Riadok bez názvu sa neukladá — v šablóne by z neho nič nevzniklo. Nie je to
    ale chyba: je úplne bežné pridať prázdny riadok a nakoniec ho nevyplniť.
    Počíta sa preto len to, čo naozaj pôjde von.
  */
  const ready: TemplateTask[] = rows
    .map(draftToTemplateTask)
    .filter((task): task is TemplateTask => task !== null);

  function patchRow(key: string, patch: Partial<TaskDraft>): void {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(key: string): void {
    setRows((current) => {
      const left = current.filter((row) => row.key !== key);
      // Editor bez jediného riadka vyzerá pokazene — posledný sa vyprázdni,
      // nezmizne.
      return left.length === 0 ? [newTaskDraft()] : left;
    });
  }

  function moveRow(key: string, direction: -1 | 1): void {
    setRows((current) => {
      const from = current.findIndex((row) => row.key === key);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;

      const next = [...current];
      const moved = next[from];
      const replaced = next[to];
      // `noUncheckedIndexedAccess`: obe hodnoty sú po kontrole hraníc isté,
      // ale prekladač to nevie — radšej sa spýtame, než by sme mu klamali.
      if (moved === undefined || replaced === undefined) return current;
      next[from] = replaced;
      next[to] = moved;
      return next;
    });
  }

  function submit(): void {
    if (isPending) return;
    setError(null);

    if (trimmedName === "") {
      setError("Šablóna musí mať názov.");
      return;
    }
    if (ready.length === 0) {
      setError("Šablóna musí mať aspoň jednu úlohu s názvom — inak pri použití nič nevznikne.");
      return;
    }

    startTransition(async () => {
      try {
        const result = isNew
          ? await createTemplate({
              name: trimmedName,
              description: description.trim() === "" ? null : description,
              tasks: ready,
            })
          : await updateTemplate(template.id, {
              name: trimmedName,
              description: description.trim() === "" ? null : description,
              tasks: ready,
            });

        if (!result.ok) {
          // Text ostáva vo formulári — odmietnutý predpis sa dá opraviť,
          // nie uhádnuť znovu.
          setError(result.error);
          return;
        }

        onSaved(
          isNew
            ? `Šablóna „${trimmedName}" je založená — ${taskCountLabel(ready.length)}.`
            : `Šablóna „${trimmedName}" je uložená — ${taskCountLabel(ready.length)}.`,
        );
      } catch {
        setError("Šablónu sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3 rounded border border-border bg-surface p-3"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
        {isNew ? "Nová šablóna" : "Úprava šablóny"}
      </h2>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label
          htmlFor={fieldId("name")}
          className="text-[12px] font-medium text-fg-muted"
        >
          Názov
        </label>
        <Input
          id={fieldId("name")}
          value={name}
          maxLength={200}
          autoComplete="off"
          autoFocus={isNew}
          disabled={isPending}
          placeholder="Napríklad: ranná rutina, príprava na dovolenku"
          onChange={(event) => {
            setName(event.target.value);
            if (error !== null) setError(null);
          }}
         
        />
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label
          htmlFor={fieldId("description")}
          className="text-[12px] font-medium text-fg-muted"
        >
          Popis
        </label>
        <textarea
          id={fieldId("description")}
          value={description}
          rows={2}
          maxLength={2000}
          disabled={isPending}
          placeholder="Kedy sa táto šablóna používa?"
          onChange={(event) => setDescription(event.target.value)}
          className={cn(
            "w-full resize-y rounded border border-border bg-surface px-2.5 py-2",
            "text-base leading-relaxed text-fg placeholder:text-fg-subtle sm:text-sm",
            "transition-colors duration-100 ease-out hover:border-border-strong",
            "disabled:pointer-events-none disabled:opacity-45",
          )}
        />
        <p className="text-[11px] leading-relaxed text-fg-subtle">
          Nepovinné. O pol roka to bude jediné, podľa čoho spoznáš, načo si
          šablónu robil.
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-[12px] font-medium text-fg-muted">Úlohy</h3>
          <p className="min-w-0 text-[11px] leading-relaxed text-fg-subtle">
            Deň je relatívny — počíta sa až od dňa, v ktorý šablónu použiješ.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <TemplateTaskRow
              key={row.key}
              draft={row}
              index={index}
              total={rows.length}
              disabled={isPending}
              onChange={(patch) => patchRow(row.key, patch)}
              onRemove={() => removeRow(row.key)}
              onMove={(direction) => moveRow(row.key, direction)}
            />
          ))}
        </ul>

        <Button
          type="button"
          disabled={isPending || rows.length >= MAX_ROWS}
          onClick={() => setRows((current) => [...current, newTaskDraft()])}
          className="h-11 self-start sm:h-9"
        >
          <Plus aria-hidden="true" size={15} />
          Pridať úlohu
        </Button>

        {rows.length >= MAX_ROWS ? (
          <p className="text-[11px] leading-relaxed text-fg-subtle">
            Viac než {MAX_ROWS} krokov už nie je rutina, ale projekt — a na ten
            sú projekty.
          </p>
        ) : null}
      </div>

      <div role="alert" aria-live="polite" className="min-w-0">
        {error !== null ? (
          <p className="text-[13px] font-medium break-words text-danger">{error}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <Button
          type="submit"
          variant="primary"
          disabled={isPending || trimmedName === ""}
          className="h-11 sm:h-9"
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
          ) : (
            <Save aria-hidden="true" size={15} />
          )}
          {isNew ? "Založiť šablónu" : "Uložiť zmeny"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={onCancel}
          className="h-11 sm:h-9"
        >
          Zrušiť
        </Button>

        <p className="min-w-0 text-[11px] leading-relaxed text-fg-subtle">
          Uloží sa {taskCountLabel(ready.length)}.
        </p>
      </div>
    </form>
  );
}
