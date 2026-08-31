"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarX2, LoaderCircle, RotateCcw } from "lucide-react";

import { areaColorValue } from "@/components/task/area-dot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatLongSk, formatRelativeSk } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  loadLessonDetail,
  setLessonCancelled,
  setLessonNote,
  setSubjectNote,
  type LessonDetail as LessonDetailData,
} from "@/server/actions/school";

/* ═══════════════════════════════════════════════════════════════════════════
   DETAIL HODINY

   Jeden panel pre obe obrazovky — otvára sa z pruhu na „Dnes" aj z mriežky
   rozvrhu. Druhá kópia by sa časom rozišla a človek by na dvoch miestach
   videl o tej istej hodine niečo iné.

   Dáta sa načítajú **až pri otvorení**. V mriežke je hodín štyridsať a ťahať
   ku každej z nich úlohy predmetu dopredu by znamenalo štyridsať dotazov na
   jedno vykreslenie — pritom otvorí sa jedna.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface LessonDetailProps {
  /** Ktorú hodinu otvoriť. `null` panel zavrie. */
  lessonId: string | null;
  onClose: () => void;
  /** Dnešok v pásme používateľa — na „termín je zajtra". */
  todayIso: string;
}

export function LessonDetail({ lessonId, onClose, todayIso }: LessonDetailProps) {
  /*
    Načítané dáta si nesú, KTOREJ hodiny sa týkajú. Bez toho by sa museli pri
    zatvorení panela nulovať v efekte — a to je synchrónny `setState`, ktorý
    spustí zbytočné druhé vykreslenie. Takto sa stará hodina proste nezhoduje
    a nevykreslí, kým nedorazí nová.
  */
  const [nacitane, setNacitane] = useState<{ id: string; data: LessonDetailData } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (lessonId === null) return;

    let platne = true;
    void loadLessonDetail(lessonId).then((result) => {
      if (!platne) return;
      if (result.ok) setNacitane({ id: lessonId, data: result.data });
      else setError(result.error);
    });

    return () => {
      platne = false;
    };
  }, [lessonId]);

  const data = nacitane !== null && nacitane.id === lessonId ? nacitane.data : null;
  const lesson = data?.lesson;

  return (
    <Dialog open={lessonId !== null} onOpenChange={(open) => !open && onClose()}>
      {lessonId !== null ? (
        <DialogContent>
          {lesson === undefined ? (
            <p className="py-6 text-center text-body text-fg-muted">
              {error ?? "Načítavam…"}
            </p>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: areaColorValue(lesson.subjectColor) }}
                    />
                    <span className={cn("min-w-0 truncate", lesson.cancelled && "line-through")}>
                      {lesson.subjectName ?? lesson.subjectCode}
                    </span>
                  </span>
                </DialogTitle>

                <DialogDescription>
                  {formatLongSk(lesson.date)} · {lesson.period}. hodina{" "}
                  {lesson.startTime}–{lesson.endTime}
                  {lesson.room ? ` · ${lesson.room}` : ""}
                </DialogDescription>

                {lesson.teacherName ?? lesson.teacherCode ? (
                  <DialogDescription>
                    {lesson.teacherName ?? lesson.teacherCode}
                    {lesson.groupName ? ` · ${lesson.groupName}` : ""}
                  </DialogDescription>
                ) : null}
              </DialogHeader>

              {lesson.cancelled ? (
                <p className="rounded border border-border bg-surface-2 px-3 py-2 text-mini text-fg-muted">
                  Táto hodina odpadla. V rozvrhu ostáva prečiarknutá a do rozpočtu
                  dňa sa neráta.
                </p>
              ) : null}

              <div className="flex flex-col gap-3">
                {/*
                  `key` je zámerne: pole si drží rozpísaný text vo vlastnom
                  stave, takže pri prepnutí na inú hodinu sa musí vytvoriť
                  nanovo. Bez toho by v ňom ostala poznámka z predchádzajúcej.
                */}
                <PoznamkaPole
                  key={`hodina-${lesson.id}`}
                  label="Poznámka k tejto hodine"
                  placeholder="Doniesť zošit, vrátiť test…"
                  value={lesson.note ?? ""}
                  onSave={(text) => setLessonNote(lesson.id, text)}
                  onError={setError}
                />

                <PoznamkaPole
                  key={`predmet-${lesson.subjectId}`}
                  label={`Poznámka k predmetu ${lesson.subjectCode}`}
                  placeholder="Platí stále — napr. vždy skúša z definícií"
                  value={lesson.subjectNote ?? ""}
                  onSave={(text) => setSubjectNote(lesson.subjectId, text)}
                  onError={setError}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <h3 className="label text-fg-subtle">Z tohto predmetu</h3>
                {(data?.tasks ?? []).length === 0 ? (
                  <p className="text-mini text-fg-muted">
                    Nič otvorené. Úloha, ktorej dáš tento predmet, sa objaví tu.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {(data?.tasks ?? []).map((task) => (
                      <li
                        key={task.id}
                        className="flex min-w-0 items-center gap-2 border-b border-border/60 py-1.5 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 truncate text-body text-fg">
                          {task.title}
                        </span>
                        {task.schoolKind === "exam" ? (
                          <span className="shrink-0 font-mono text-micro uppercase tracking-[0.08em] text-warn">
                            písomka
                          </span>
                        ) : null}
                        {task.dueDate ? (
                          <span className="shrink-0 font-mono text-mini tabular-nums text-fg-muted">
                            {formatRelativeSk(task.dueDate, new Date(`${todayIso}T12:00:00`))}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await setLessonCancelled(
                        lesson.id,
                        !lesson.cancelled,
                      );
                      if (!result.ok) setError(result.error);
                      else {
                        const znova = await loadLessonDetail(lesson.id);
                        if (znova.ok) setNacitane({ id: lesson.id, data: znova.data });
                      }
                    })
                  }
                >
                  {isPending ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : lesson.cancelled ? (
                    <RotateCcw className="size-3.5" />
                  ) : (
                    <CalendarX2 className="size-3.5" />
                  )}
                  {lesson.cancelled ? "Predsa bude" : "Odpadla"}
                </Button>
              </div>

              {error ? <p className="text-mini text-danger">{error}</p> : null}
            </>
          )}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/**
 * Poznámka, ktorá sa uloží opustením poľa.
 *
 * Tlačidlo „uložiť" tu nie je zámerne — je to jedna veta a celá appka sa
 * ukladá sama. Escape vráti pôvodné znenie.
 */
function PoznamkaPole({
  label,
  placeholder,
  value,
  onSave,
  onError,
}: {
  label: string;
  placeholder: string;
  value: string;
  onSave: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [, startTransition] = useTransition();

  function save(): void {
    if (draft.trim() === value.trim()) return;
    startTransition(async () => {
      const result = await onSave(draft);
      if (!result.ok) {
        setDraft(value);
        onError(result.error);
      }
    });
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="label text-fg-subtle">{label}</span>
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(value);
            event.currentTarget.blur();
          }
        }}
        maxLength={500}
        placeholder={placeholder}
      />
    </label>
  );
}
