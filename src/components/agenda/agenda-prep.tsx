"use client";

import { useCallback, useEffect, useId, useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";

import { useTaskDetail } from "@/components/task/task-detail-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { agendaTypeInstrumental, isAssessment, shortDaySk } from "@/lib/agenda";
import { PREP_KIND_LABELS } from "@/lib/agenda-prep";
import { formatDayMonthSk, formatDuration } from "@/lib/dates";
import { fold } from "@/lib/fold";
import { SCHOOL_KINDS, schoolKindInRow, schoolKindShort, type SchoolKind } from "@/lib/school-kind";
import { pluralSk } from "@/lib/sk";
import { cn } from "@/lib/utils";
import {
  acceptPrep,
  loadAgendaPrep,
  suggestPrep,
  type PrepOfferSlot,
} from "@/server/actions/agenda-prep";
import { loadTaskDetail, quickCapture, toggleTaskDone } from "@/server/actions/tasks";
import type { AgendaItemRow, AgendaTask } from "@/server/queries/agenda";

/**
 * Druh úlohy, keď ho názov sám nepovie. Parser slovo „zopakovať" z názvu
 * vystrihne (stane sa z neho druh), takže z „zopakovať cykly" ostane „cykly"
 * — bez štítku by riadok nehovoril, čo s cyklami.
 */
function kindTag(task: AgendaTask): string | null {
  const kind = task.schoolKind as SchoolKind | null;
  if (kind === null || !SCHOOL_KINDS.includes(kind) || !schoolKindInRow(kind)) return null;
  const short = schoolKindShort(kind);
  return fold(task.title).startsWith(fold(short)) ? null : short;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRÍPRAVA A ÚLOHY POD UDALOSŤOU

   Sekcia v detaile udalosti. Pri písomke „Príprava" s ponukou plánu, pri
   deadline „Úlohy k deadlinu". Úlohy sú obyčajné úlohy — tu sa dajú
   odškrtnúť a otvoriť, všetko ostatné (presun, odhad) robí ich vlastný detail.
   ═══════════════════════════════════════════════════════════════════════════ */

interface OfferRow extends PrepOfferSlot {
  on: boolean;
}

export function AgendaPrep({
  item,
  todayIso,
  autoOffer,
  reloadKey,
  onChanged,
  onCloseDetail,
  onTasks,
}: {
  item: AgendaItemRow;
  todayIso: string;
  /** Otvorené po zachytení písomky — návrh sa ukáže hneď. */
  autoOffer: boolean;
  /** Zmena zvonka (posun prípravy po presune) — načítať znova. */
  reloadKey: number;
  /** Úlohy sa zmenili — detail si obnoví postup udalosti. */
  onChanged: () => void;
  /** Zavrie detail udalosti pred otvorením detailu úlohy. */
  onCloseDetail: () => void;
  /** Načítané úlohy — detail z nich píše vetu o rannej pripomienke prípravy. */
  onTasks?: (tasks: AgendaTask[]) => void;
}) {
  const [tasks, setTasks] = useState<AgendaTask[] | null>(null);
  const [offer, setOffer] = useState<OfferRow[] | null>(null);
  const [offerAsked, setOfferAsked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const taskDetail = useTaskDetail();

  const assessment = item.kind === "event" && isAssessment(item.type);
  const past = item.date < todayIso;
  const canOffer = assessment && !past && item.cancelledAt === null;
  const title = item.kind === "deadline" ? "Úlohy k deadlinu" : assessment ? "Príprava" : "Úlohy";

  const reload = useCallback(async () => {
    const result = await loadAgendaPrep(item.id);
    if (result.ok) {
      setTasks(result.data);
      onTasks?.(result.data);
    } else {
      setError(result.error);
    }
    return result.ok ? result.data : null;
  }, [item.id, onTasks]);

  function ask(): void {
    setError(null);
    setMessage(null);
    setOfferAsked(true);
    startTransition(async () => {
      const result = await suggestPrep(item.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOffer(result.data.map((slot) => ({ ...slot, on: true })));
    });
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const loaded = await reload();
      /* Po zachytení písomky: návrh hneď, ak k nej ešte nič nie je. */
      if (alive && autoOffer && canOffer && loaded !== null && loaded.length === 0 && !offerAsked) {
        ask();
      }
    })();
    return () => {
      alive = false;
    };
    // `ask` a `offerAsked` zámerne nie: návrh sa pýta raz, pri otvorení.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, reloadKey]);

  function accept(): void {
    if (offer === null) return;
    const picks = offer.filter((row) => row.on);
    if (picks.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await acceptPrep(
        item.id,
        picks.map(({ date, kind, estimateMin }) => ({ date, kind, estimateMin })),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOffer(null);
      const n = result.data.created;
      setMessage(`Pridaná príprava: ${n} ${pluralSk(n, "úloha", "úlohy", "úloh")}. Nájdeš ich v dňoch, na ktoré padli.`);
      await reload();
      onChanged();
    });
  }

  function toggle(task: AgendaTask): void {
    setError(null);
    // Hneď prekresliť, server potvrdí — pri chybe sa zoznam načíta znova.
    setTasks((current) =>
      current?.map((t) => (t.id === task.id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t)) ?? current,
    );
    startTransition(async () => {
      const result = await toggleTaskDone(task.id);
      if (!result.ok) setError(result.error);
      await reload();
      onChanged();
    });
  }

  function openTask(id: string): void {
    if (taskDetail === null) return;
    startTransition(async () => {
      const result = await loadTaskDetail(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Najprv zavrieť udalosť — dva panely na sebe by sa bili o Escape.
      onCloseDetail();
      taskDetail.open(result.data);
    });
  }

  function add(text: string): Promise<boolean> {
    setError(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await quickCapture(text, {
          agendaItemId: item.id,
          ...(assessment ? { defaultSchoolKind: "study" as const } : {}),
        });
        if (!result.ok) {
          setError(result.error);
          resolve(false);
          return;
        }
        await reload();
        onChanged();
        resolve(true);
      });
    });
  }

  const list = tasks ?? [];
  const done = list.filter((t) => t.status === "done");
  const minTotal = list.reduce((sum, t) => sum + (t.estimateMin ?? 0), 0);
  const minDone = done.reduce((sum, t) => sum + (t.estimateMin ?? 0), 0);

  return (
    <section aria-labelledby="agenda-prep" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id="agenda-prep" className="label text-fg-muted">
          {title}
        </h3>
        {list.length > 0 ? (
          <span className="font-mono text-mini tabular-nums text-fg-muted">
            {done.length}/{list.length} hotové
            {minTotal > 0 ? ` · ${formatDuration(minDone)} z ${formatDuration(minTotal)}` : ""}
          </span>
        ) : null}
      </div>

      {list.length > 0 ? (
        <ul className="flex flex-col rounded border border-border">
          {list.map((task) => {
            const isDone = task.status === "done";
            return (
              <li
                key={task.id}
                className="grid grid-cols-[2.75rem_4.5rem_minmax(0,1fr)_auto] items-center gap-x-2 border-b border-border pr-3 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => toggle(task)}
                  disabled={isPending}
                  aria-pressed={isDone}
                  aria-label={isDone ? `Vrátiť: ${task.title}` : `Hotovo: ${task.title}`}
                  className="inline-flex size-11 items-center justify-center"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-flex size-4 items-center justify-center rounded-sm border",
                      isDone ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface",
                    )}
                  >
                    {isDone ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                </button>
                <span className="whitespace-nowrap font-mono text-meta tabular-nums text-fg-muted">
                  {task.plannedDate !== null
                    ? shortDaySk(task.plannedDate)
                    : task.dueDate !== null
                      ? `do ${formatDayMonthSk(task.dueDate)}`
                      : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => openTask(task.id)}
                  disabled={taskDetail === null}
                  className="flex min-w-0 items-baseline gap-2 py-2 text-left"
                >
                  <span
                    className={cn(
                      "min-w-0 truncate text-body hover:underline",
                      isDone ? "text-fg-subtle line-through" : "text-fg",
                    )}
                  >
                    {task.title}
                  </span>
                  {kindTag(task) !== null ? (
                    <span className="shrink-0 font-mono text-micro uppercase tracking-[0.08em] text-fg-subtle">
                      {kindTag(task)}
                    </span>
                  ) : null}
                </button>
                <span className="font-mono text-mini tabular-nums text-fg-muted">
                  {task.estimateMin !== null ? `${task.estimateMin} min` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {offer !== null ? (
        <OfferBox
          rows={offer}
          todayIso={todayIso}
          type={item.type === "oral" ? "oral" : "exam"}
          pending={isPending}
          onToggle={(index, on) =>
            setOffer((current) => current?.map((row, i) => (i === index ? { ...row, on } : row)) ?? current)
          }
          onAccept={accept}
          onDecline={() => setOffer(null)}
        />
      ) : canOffer && list.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="rounded bg-surface-2 px-3 py-2 text-meta text-fg-muted">Zatiaľ bez prípravy.</p>
          <Button size="sm" disabled={isPending} onClick={ask}>
            Navrhnúť prípravu
          </Button>
        </div>
      ) : null}

      {item.kind === "deadline" && list.length === 0 ? (
        <p className="rounded bg-surface-2 px-3 py-2 text-meta text-fg-muted">
          Zatiaľ žiadne úlohy. Úloha, ktorú sem pridáš a nemá termín, dostane termín z deadlinu.
        </p>
      ) : null}

      {message !== null ? (
        <p role="status" className="text-meta text-fg-muted">
          {message}
        </p>
      ) : null}
      {error !== null ? (
        <p role="alert" className="text-meta font-medium text-danger">
          {error}
        </p>
      ) : null}

      {item.cancelledAt === null && !past ? (
        <AddTask deadline={item.kind === "deadline"} onAdd={add} />
      ) : null}
    </section>
  );
}

/**
 * Návrh prípravy — ponuka, nie príkaz. Všetko je predvolene zaškrtnuté;
 * odškrtne sa, čo človek nechce. Pri posunutom dni stojí prečo.
 */
function OfferBox({
  rows,
  todayIso,
  type,
  pending,
  onToggle,
  onAccept,
  onDecline,
}: {
  rows: readonly OfferRow[];
  todayIso: string;
  type: "exam" | "oral";
  pending: boolean;
  onToggle: (index: number, on: boolean) => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const baseId = useId();
  const total = rows.filter((row) => row.on).reduce((sum, row) => sum + row.estimateMin, 0);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="rounded bg-surface-2 px-3 py-2 text-meta text-fg-muted">
          Na prípravu už pred {agendaTypeInstrumental(type)} nezostal čas.
        </p>
        <Button size="sm" variant="ghost" onClick={onDecline}>
          Zavrieť
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded border border-border">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border bg-surface-2 px-3 py-2">
          <span className="label text-fg-muted">Návrh prípravy</span>
          <span className="text-mini text-fg-muted">ponuka · odškrtni, čo nechceš</span>
        </div>
        {rows.map((row, index) => {
          const id = `${baseId}-${index}`;
          return (
            <label
              key={row.date}
              htmlFor={id}
              className="grid cursor-pointer grid-cols-[1rem_4.5rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-2"
            >
              <input
                id={id}
                type="checkbox"
                checked={row.on}
                onChange={(event) => onToggle(index, event.target.checked)}
                className="size-4 accent-accent"
              />
              <span className="font-mono text-meta font-medium tabular-nums">{shortDaySk(row.date)}</span>
              <span className="text-body">{PREP_KIND_LABELS[row.kind]}</span>
              <span className="font-mono text-mini tabular-nums text-fg-muted">{row.estimateMin} min</span>
              <span className="col-start-3 col-end-5 font-mono text-micro text-fg-muted">
                {row.schoolMin > 0 ? `škola ${formatDuration(row.schoolMin)}` : "bez školy"}
                {row.date === todayIso ? " · dnes" : ""}
              </span>
              {row.why !== null ? (
                <span className="col-start-3 col-end-5 text-mini text-accent">posunuté, lebo {row.why}</span>
              ) : null}
            </label>
          );
        })}
        <p className="px-3 py-2 text-mini text-fg-muted">
          Spolu <span className="font-mono tabular-nums">{formatDuration(total)}</span> pred{" "}
          {agendaTypeInstrumental(type)}. Úlohy sa potom dajú presúvať ako každé iné.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={pending || total === 0} onClick={onAccept}>
          Pridať prípravu
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={onDecline}>
          Nechať tak
        </Button>
      </div>
    </div>
  );
}

/**
 * Vlastná úloha pod udalosťou — rovnaký zápis ako rýchle zachytenie.
 *
 * Čaká len na vlastné uloženie, nie na zvyšok sekcie: Enter hneď po
 * „Pridať prípravu" by sa inak potichu stratil, kým sa zoznam načítava.
 */
function AddTask({
  deadline,
  onAdd,
}: {
  deadline: boolean;
  onAdd: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const disabled = busy;

  async function submit(): Promise<void> {
    const clean = text.trim();
    if (clean === "" || busy) return;
    setBusy(true);
    try {
      if (await onAdd(clean)) setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="sr-only">
        {deadline ? "Nová úloha k deadlinu" : "Nová úloha k udalosti"}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          value={text}
          maxLength={500}
          placeholder={deadline ? "Úloha k deadlinu…" : "Vlastná úloha, napr. prepočítať príklady 5–9"}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          className="min-w-0 flex-1"
        />
        <Button size="sm" disabled={disabled || text.trim() === ""} onClick={() => void submit()}>
          <Plus className="size-3.5" aria-hidden="true" />
          Pridať
        </Button>
      </div>
    </div>
  );
}
