"use client";

import { useId, useState } from "react";
import Link from "next/link";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AGENDA_REMINDER_LABELS,
  isAgendaReminder,
  shortDaySk,
  type AgendaReminder,
} from "@/lib/agenda";
import {
  EVENING_TIME,
  MORNING_TIME,
  agendaReminderPayload,
  reminderOptions,
} from "@/lib/agenda-reminders";
import type { AgendaItemRow, AgendaTask } from "@/server/queries/agenda";

/**
 * Pripomienka udalosti v detaile.
 *
 * Prepínač a jedna voľba — viac pripomienok na jednu písomku by sa rýchlo
 * zmenilo na šum. Pod voľbou je **ukážka notifikácie**, poskladaná tou istou
 * funkciou, ktorou ju skladá plánovač: čo vidíš tu, príde do telefónu.
 */
export function AgendaReminderSection({
  item,
  tasks,
  todayIso,
  pending,
  onChange,
}: {
  item: AgendaItemRow;
  /** Úlohy pod udalosťou — na vetu o rannej pripomienke prípravy. */
  tasks: readonly AgendaTask[];
  todayIso: string;
  pending: boolean;
  onChange: (remind: AgendaReminder | null) => void;
}) {
  const checkboxId = useId();
  const options = reminderOptions(item);
  /*
    Voľba sa prekreslí hneď, uloženie beží na pozadí — prepínač, ktorý sa
    pohne až po odpovedi servera, pôsobí ako pokazený. Keď príde čerstvá
    udalosť (po uložení alebo zvonka), prevezme sa jej hodnota.
  */
  const saved = isAgendaReminder(item.remind) ? item.remind : null;
  const [remind, setRemind] = useState<AgendaReminder | null>(saved);
  const [seen, setSeen] = useState(item.remind);
  if (seen !== item.remind) {
    setSeen(item.remind);
    setRemind(saved);
  }
  function change(next: AgendaReminder | null): void {
    setRemind(next);
    onChange(next);
  }
  /*
    Detail sa kreslí až po otvorení, v prehliadači — stav povolenia sa dá
    prečítať rovno. Na serveri by sa sem nikdy nedostal.
  */
  const [permission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  const nextPrep = tasks
    .filter((t) => t.status !== "done" && t.plannedDate !== null && t.plannedDate >= todayIso && t.plannedDate < item.date)
    .map((t) => t.plannedDate as string)
    .sort()[0];

  const preview =
    remind !== null
      ? agendaReminderPayload(item, remind, {
          id: item.id,
          subjectCode: item.subject?.code ?? null,
          place: item.place,
          progress: item.progress,
        })
      : null;
  const previewTime = remind === "eve" ? EVENING_TIME : remind === "morn" ? MORNING_TIME : "o hodinu";

  return (
    <section aria-labelledby={`${checkboxId}-h`} className="flex flex-col gap-2">
      <h3 id={`${checkboxId}-h`} className="label text-fg-muted">
        Pripomienka
      </h3>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={checkboxId} className="flex min-h-11 items-center gap-2 text-body md:min-h-0">
          <input
            id={checkboxId}
            type="checkbox"
            checked={remind !== null}
            onChange={(event) => change(event.target.checked ? (options[0] ?? "eve") : null)}
            className="size-4 accent-accent"
          />
          Pripomenúť
        </label>

        <Select
          value={remind ?? options[0] ?? "eve"}
          disabled={remind === null || pending}
          onValueChange={(value) => {
            if (isAgendaReminder(value)) change(value);
          }}
        >
          <SelectTrigger aria-label="Kedy pripomenúť" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {AGENDA_REMINDER_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preview !== null ? (
        <div
          aria-label="Ukážka notifikácie"
          className="flex gap-2.5 rounded border border-border bg-surface-2 px-3 py-2.5"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded bg-accent font-mono text-micro font-semibold text-accent-fg"
          >
            tm
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex justify-between gap-2 text-micro text-fg-muted">
              <span>Task manažér</span>
              <span className="font-mono tabular-nums">{previewTime}</span>
            </span>
            <strong className="truncate text-body font-semibold text-fg">{preview.title}</strong>
            <span className="text-meta text-fg-muted">{preview.body}</span>
          </span>
        </div>
      ) : null}

      {remind !== null && nextPrep !== undefined ? (
        <p className="text-mini text-fg-muted">
          Ráno v deň prípravy pripomenie aj ju ({shortDaySk(nextPrep)}).
        </p>
      ) : null}

      {remind !== null && permission !== "granted" ? (
        <p className="text-mini text-fg-muted">
          {permission === "unsupported"
            ? "Tento prehliadač notifikácie nevie — pripomienka príde na zariadenia, kde ich máš zapnuté."
            : "Na tomto zariadení notifikácie zapnuté nemáš. "}
          {permission !== "unsupported" ? (
            <Link href="/nastavenia" className="font-medium text-accent underline-offset-2 hover:underline">
              Zapnúť v Nastaveniach
            </Link>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
