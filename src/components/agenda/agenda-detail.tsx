"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, LoaderCircle, X } from "lucide-react";

import { AgendaShape, Countdown, SubjectChip } from "@/components/agenda/agenda-bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  agendaKindLabel,
  agendaTimeRange,
  agendaTypeLabel,
  countdownSk,
  hhmm,
  isAgendaPast,
  isAssessment,
  isMultiDay,
  type AgendaKind,
  type AgendaType,
} from "@/lib/agenda";
import { diffDays, formatLongSk } from "@/lib/dates";
import { pluralSk } from "@/lib/sk";
import { cn } from "@/lib/utils";
import {
  deleteAgendaItem,
  loadAgendaItem,
  moveAgendaItem,
  setAgendaCancelled,
  setAgendaGrade,
  updateAgendaItem,
  type AgendaInput,
} from "@/server/actions/agenda";
import type { AgendaItemRow } from "@/server/queries/agenda";

export interface AgendaSubjectOption {
  id: string;
  code: string;
  name: string | null;
  color: string;
}

export interface AgendaDetailProps {
  item: AgendaItemRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Po zmazaní — panel sa zavrie a volajúci ponúkne vrátenie. */
  onDeleted: (item: AgendaItemRow) => void;
  onRestoreFocus: () => void;
  subjects: readonly AgendaSubjectOption[];
  todayIso: string;
}

/** Druhy, ktoré dávajú pri danom druhu zmysel — písomka nie je deadline. */
const TYPES_FOR: Record<AgendaKind, readonly AgendaType[]> = {
  event: ["exam", "oral", "other"],
  deadline: ["submit", "other"],
};

const NONE = "__none__";

/**
 * Detail udalosti — bočný panel na počítači, celá obrazovka na telefóne.
 *
 * Rovnaký rám ako detail úlohy (`task-detail.tsx`): zatváranie vľavo hore
 * na telefóne, krížik vpravo od `md`, štítok v strojopise namiesto nadpisu
 * obrazovky. Na rozdiel od úlohy sa tu nič neodškrtáva — udalosť sa dá
 * presunúť, zrušiť, upraviť a po písomke k nej zapísať známku.
 */
export function AgendaDetail({
  item: initial,
  open,
  onOpenChange,
  onDeleted,
  onRestoreFocus,
  subjects,
  todayIso,
}: AgendaDetailProps) {
  const [item, setItem] = useState<AgendaItemRow>(initial);
  const [mode, setMode] = useState<"view" | "edit" | "move" | "confirmDelete">("view");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const past = isAgendaPast(item, todayIso);
  const cancelled = item.cancelledAt !== null;
  const assessment = item.kind === "event" && isAssessment(item.type);

  /** Spustí akciu, potom si z databázy vezme čerstvý stav udalosti. */
  function run(action: () => Promise<{ ok: boolean; error?: string }>, after?: () => void): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error ?? "Nepodarilo sa to.");
          return;
        }
        const fresh = await loadAgendaItem(item.id);
        if (fresh.ok) setItem(fresh.data);
        after?.();
      } catch {
        setError("Spojenie zlyhalo. Skús to znova.");
      }
    });
  }

  function remove(): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteAgendaItem(item.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDeleted(item);
      } catch {
        setError("Spojenie zlyhalo. Skús to znova.");
      }
    });
  }

  const subject = item.subject;
  const range = agendaTimeRange(item);
  const days = diffDays(todayIso, item.date);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
        className={cn(
          "flex h-dvh max-h-dvh w-full max-w-none flex-col overflow-hidden rounded-none border-0 p-0",
          "md:ml-auto md:mr-0 md:w-[440px] md:border-l md:border-border",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2 md:h-12 md:px-4 md:py-0">
          <DialogClose
            aria-label="Zavrieť detail udalosti"
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center rounded",
              "text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg md:hidden",
            )}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </DialogClose>
          <AgendaShape kind={item.kind} type={item.type} />
          <DialogTitle className="label min-w-0 truncate text-fg-subtle">
            {agendaKindLabel(item)}
          </DialogTitle>
          {isPending ? (
            <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-fg-subtle" />
          ) : null}
          <DialogClose
            aria-label="Zavrieť"
            className={cn(
              "ml-auto hidden size-8 items-center justify-center rounded md:inline-flex",
              "text-fg-subtle transition-colors duration-100 hover:bg-surface-2 hover:text-fg",
            )}
          >
            <X className="size-4" />
          </DialogClose>
        </div>

        {mode === "edit" ? (
          <AgendaForm
            item={item}
            subjects={subjects}
            pending={isPending}
            onCancel={() => setMode("view")}
            onSave={(input) =>
              run(
                () => updateAgendaItem(item.id, input),
                () => setMode("view"),
              )
            }
          />
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 md:px-5">
              <h2
                className={cn(
                  "text-lg font-semibold leading-snug text-balance",
                  cancelled ? "text-fg-muted line-through" : "text-fg",
                )}
              >
                {item.title}
              </h2>

              {cancelled ? (
                <p className="rounded bg-surface-2 px-3 py-2 text-meta text-fg-muted">
                  Zrušená. Ostáva v zozname prečiarknutá, nemaže sa.
                </p>
              ) : null}

              {notice !== null ? (
                <p role="status" className="rounded border border-accent bg-accent-soft px-3 py-2 text-meta text-fg">
                  {notice}
                </p>
              ) : null}

              {mode === "move" ? (
                <MoveForm
                  date={item.date}
                  todayIso={todayIso}
                  pending={isPending}
                  onCancel={() => setMode("view")}
                  onMove={(date) =>
                    run(
                      async () => {
                        const result = await moveAgendaItem(item.id, date);
                        if (result.ok && result.data.pendingTaskIds.length > 0) {
                          const n = result.data.pendingTaskIds.length;
                          setNotice(
                            `Presunuté. ${n} ${pluralSk(n, "úloha", "úlohy", "úloh")} k tomu ostali na pôvodných dňoch.`,
                          );
                        } else if (result.ok) {
                          setNotice(null);
                        }
                        return result;
                      },
                      () => setMode("view"),
                    )
                  }
                />
              ) : null}

              <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-body">
                <dt className="label pt-0.5 text-fg-muted">Kedy</dt>
                <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    {isMultiDay(item) && item.endDate !== null
                      ? `${formatLongSk(item.date)} – ${formatLongSk(item.endDate)}`
                      : formatLongSk(item.date)}
                  </span>
                  {item.period !== null ? (
                    <span className="text-fg-muted">· {item.period}. hodina</span>
                  ) : null}
                  {item.kind === "deadline" ? (
                    <span className="font-mono text-meta text-fg-muted">
                      · do {hhmm(item.endTime) ?? "konca dňa"}
                    </span>
                  ) : range !== null ? (
                    <span className="font-mono text-meta text-fg-muted">· {range}</span>
                  ) : (
                    <span className="text-fg-muted">· celý deň</span>
                  )}
                  {!past ? <Countdown days={days} label={countdownSk(item.date, todayIso)} /> : null}
                </dd>

                {item.place ? (
                  <>
                    <dt className="label pt-0.5 text-fg-muted">Kde</dt>
                    <dd>{item.place}</dd>
                  </>
                ) : null}

                {subject !== null ? (
                  <>
                    <dt className="label pt-0.5 text-fg-muted">Predmet</dt>
                    <dd className="flex items-center gap-2">
                      <SubjectChip code={subject.code} color={subject.color} />
                      {subject.name ?? null}
                    </dd>
                  </>
                ) : null}

                {item.note ? (
                  <>
                    <dt className="label pt-0.5 text-fg-muted">Poznámka</dt>
                    <dd className="whitespace-pre-line">{item.note}</dd>
                  </>
                ) : null}
              </dl>

              {item.kind === "deadline" ? (
                <p className="rounded bg-surface-2 px-3 py-2 text-meta text-fg-muted">
                  Deadline neuberá z času dňa. Keď prejde, nepadá do „po termíne“ — tam idú úlohy, nie on.
                </p>
              ) : null}
              {isMultiDay(item) && item.blocksDay ? (
                <p className="rounded bg-surface-2 px-3 py-2 text-meta text-fg-muted">
                  Zaberá celé dni. Rozpočet ich ukáže ako obsadené.
                </p>
              ) : null}

              {past && assessment ? (
                <GradeSection
                  grade={item.grade}
                  note={item.gradeNote}
                  pending={isPending}
                  onGrade={(grade, note) => run(() => setAgendaGrade(item.id, grade, note))}
                />
              ) : null}

              {mode === "confirmDelete" ? (
                <div className="flex flex-col gap-2 rounded border border-danger px-3 py-3">
                  <p className="text-body">
                    Zmazať? Na to, že sa niečo nekonalo, je <strong>Zrušiť</strong> — zrušená
                    udalosť ostane v zozname prečiarknutá.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="danger" size="sm" disabled={isPending} onClick={remove}>
                      Zmazať
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setMode("view")}>
                      Nechať
                    </Button>
                  </div>
                </div>
              ) : null}

              {error !== null ? (
                <p role="alert" className="text-meta font-medium text-danger">
                  {error}
                </p>
              ) : null}
            </div>

            {/*
              Lišta akcií len v náhľade. Pri presune a potvrdení zmazania má
              formulár vlastné tlačidlá — druhé „Presunúť“ či „Zmazať“ dole by
              nebolo jasné, ktoré z nich naozaj koná.
            */}
            {mode === "view" ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-4 py-3 md:px-5">
                {!past ? (
                  <Button size="sm" disabled={isPending} onClick={() => setMode("move")}>
                    Presunúť
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => run(() => setAgendaCancelled(item.id, !cancelled))}
                >
                  {cancelled ? "Obnoviť" : "Zrušiť"}
                </Button>
                <Button size="sm" variant="ghost" disabled={isPending} onClick={() => setMode("edit")}>
                  Upraviť
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  disabled={isPending}
                  onClick={() => setMode("confirmDelete")}
                >
                  Zmazať
                </Button>
              </div>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRESUN
   ═══════════════════════════════════════════════════════════════════════════ */

function MoveForm({
  date,
  todayIso,
  pending,
  onCancel,
  onMove,
}: {
  date: string;
  todayIso: string;
  pending: boolean;
  onCancel: () => void;
  onMove: (date: string) => void;
}) {
  const [value, setValue] = useState(date);
  const id = useId();
  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-border px-3 py-3">
      <label htmlFor={id} className="flex flex-col gap-1">
        <span className="label text-fg-muted">Nový dátum</span>
        <Input
          id={id}
          type="date"
          value={value}
          min={todayIso}
          onChange={(event) => setValue(event.target.value)}
          className="w-44"
        />
      </label>
      <Button variant="primary" size="sm" disabled={pending || value === "" || value === date} onClick={() => onMove(value)}>
        Presunúť
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Späť
      </Button>
      <p className="basis-full text-mini text-fg-muted">
        Písomka si na novom dni nájde hodinu predmetu sama.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZNÁMKA
   ═══════════════════════════════════════════════════════════════════════════ */

function GradeSection({
  grade,
  note,
  pending,
  onGrade,
}: {
  grade: number | null;
  note: string | null;
  pending: boolean;
  onGrade: (grade: number | null, note: string | null) => void;
}) {
  const [draft, setDraft] = useState(note ?? "");
  const noteId = useId();
  return (
    <section aria-labelledby="agenda-grade" className="flex flex-col gap-2">
      <h3 id="agenda-grade" className="label text-fg-muted">
        Výsledok
      </h3>
      <div role="group" aria-label="Známka" className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={grade === g}
            disabled={pending}
            onClick={() => onGrade(grade === g ? null : g, draft.trim() === "" ? null : draft)}
            className={cn(
              "inline-flex size-11 items-center justify-center rounded border font-mono text-sm font-semibold md:size-9",
              "transition-colors duration-100",
              grade === g
                ? "border-accent bg-accent text-accent-fg"
                : "border-border-strong bg-surface text-fg hover:bg-surface-2",
            )}
          >
            {g}
          </button>
        ))}
      </div>
      <label htmlFor={noteId} className="flex flex-col gap-1">
        <span className="text-mini text-fg-muted">Poznámka k výsledku</span>
        <Input
          id={noteId}
          value={draft}
          maxLength={500}
          placeholder="napr. chyba vo výpočte zrýchlenia"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if ((note ?? "") !== draft.trim()) onGrade(grade, draft.trim() === "" ? null : draft);
          }}
        />
      </label>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ÚPRAVA
   ═══════════════════════════════════════════════════════════════════════════ */

function AgendaForm({
  item,
  subjects,
  pending,
  onCancel,
  onSave,
}: {
  item: AgendaItemRow;
  subjects: readonly AgendaSubjectOption[];
  pending: boolean;
  onCancel: () => void;
  onSave: (input: AgendaInput) => void;
}) {
  const [kind, setKind] = useState<AgendaKind>(item.kind);
  const [type, setType] = useState<AgendaType>(item.type);
  const [title, setTitle] = useState(item.title);
  const [date, setDate] = useState(item.date);
  const [endDate, setEndDate] = useState(item.endDate ?? "");
  const [startTime, setStartTime] = useState(hhmm(item.startTime) ?? "");
  const [endTime, setEndTime] = useState(hhmm(item.endTime) ?? "");
  const [place, setPlace] = useState(item.place ?? "");
  const [subjectId, setSubjectId] = useState(item.subjectId ?? NONE);
  const [blocksDay, setBlocksDay] = useState(item.blocksDay);
  const [note, setNote] = useState(item.note ?? "");

  const types = TYPES_FOR[kind];
  const effectiveType = types.includes(type) ? type : "other";
  /*
    Pri písomke a skúšaní sa čas neukladá, ak sa nezmenil deň ani predmet —
    server ho inak prepočíta z rozvrhu. Keď človek čas vymaže, rozvrh ho
    doplní znova.
  */
  const lessonTimed = item.period !== null && date === item.date && subjectId === (item.subjectId ?? NONE);

  function submit(): void {
    onSave({
      kind,
      type: effectiveType,
      title,
      note: note.trim() === "" ? null : note,
      date,
      endDate: kind === "event" && endDate !== "" && endDate > date ? endDate : null,
      startTime: kind === "event" && startTime !== "" && !lessonTimed ? startTime : lessonTimed ? hhmm(item.startTime) : null,
      endTime: endTime !== "" ? endTime : null,
      place: place.trim() === "" ? null : place,
      subjectId: subjectId === NONE ? null : subjectId,
      blocksDay,
      remind: (item.remind as AgendaInput["remind"]) ?? null,
    });
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:px-5">
        <Field label="Názov">
          <Input value={title} maxLength={500} onChange={(event) => setTitle(event.target.value)} required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Druh">
            <Select value={kind} onValueChange={(value) => setKind(value as AgendaKind)}>
              <SelectTrigger aria-label="Druh">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="event">Udalosť</SelectItem>
                <SelectItem value="deadline">Deadline</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Typ">
            <Select value={effectiveType} onValueChange={(value) => setType(value as AgendaType)}>
              <SelectTrigger aria-label="Typ">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t === "other" ? "Iné" : agendaTypeLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === "event" ? "Deň (od)" : "Deň"}>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </Field>
          {kind === "event" ? (
            <Field label="Do (viac dní)">
              <Input type="date" value={endDate} min={date} onChange={(event) => setEndDate(event.target.value)} />
            </Field>
          ) : (
            <Field label="Do koľkej">
              <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </Field>
          )}
        </div>

        {kind === "event" && (endDate === "" || endDate <= date) ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Začiatok">
              <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </Field>
            <Field label="Koniec">
              <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </Field>
            {isAssessment(effectiveType) ? (
              <p className="col-span-2 text-mini text-fg-muted">
                Bez času si písomka vezme hodinu predmetu z rozvrhu.
              </p>
            ) : null}
          </div>
        ) : null}

        <Field label="Predmet">
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger aria-label="Predmet">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Bez predmetu</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name ? `${s.code} · ${s.name}` : s.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Miesto">
          <Input value={place} maxLength={200} onChange={(event) => setPlace(event.target.value)} />
        </Field>

        {kind === "event" ? (
          <label className="flex items-start gap-2 text-body">
            <input
              type="checkbox"
              checked={blocksDay}
              onChange={(event) => setBlocksDay(event.target.checked)}
              className="mt-0.5 size-4 accent-accent"
            />
            <span>
              Zaberá celý deň
              <span className="block text-mini text-fg-muted">Výlet áno, narodeniny nie — deň sa potom neplánuje.</span>
            </span>
          </label>
        ) : null}

        <Field label="Poznámka">
          <Textarea value={note} maxLength={10_000} rows={3} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-4 py-3 md:px-5">
        <Button type="submit" variant="primary" size="sm" disabled={pending || title.trim() === "" || date === ""}>
          Uložiť
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Späť
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label text-fg-muted">{label}</span>
      {children}
    </label>
  );
}
