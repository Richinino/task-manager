"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarX2, LoaderCircle, RotateCcw, Replace } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatLongSk, formatRelativeSk } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  loadLessonDetail,
  clearLessonSubstitution,
  setLessonCancelled,
  setLessonSubstitution,
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
  /*
    Formulár zmeny si nesie, KTOREJ hodiny sa týka — rovnako ako načítané
    dáta o riadok nižšie. Nulovať ho v efekte by znamenalo `setState` počas
    vykresľovania; takto sa pri inej hodine proste nezhodne a nevykreslí.
  */
  const [meniSaPre, setMeniSaPre] = useState<string | null>(null);
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
  const meniSa = meniSaPre !== null && meniSaPre === lessonId;
  const subjects = data?.subjects ?? [];
  const teachers = data?.teachers ?? [];

  /*
    Vyučujúci sa v detaile nesie ako skratka, nie ako id — do výberu ho treba
    nájsť podľa nej. Pridávať ďalší stĺpec do dotazu len kvôli tomuto by
    znamenalo ťahať id, ktoré nikto iný nepotrebuje.
  */
  const teacherId =
    teachers.find((u) => u.code === lesson?.teacherCode)?.id ?? null;

  /** Hodnota pre „vyučujúci sa nevie" — prázdny reťazec Select neprijme. */
  const NIKTO = "ziadny";

  /**
   * Uloží zmenu a načíta detail znova.
   *
   * Znova, a nie optimisticky: suplovanie mení predmet, a s ním farbu, názov
   * aj zoznam úloh k nemu. Domýšľať si to v klientovi by znamenalo mať tú istú
   * logiku na dvoch miestach.
   */
  function uloz(
    akcia: () => Promise<{ ok: boolean; error?: string }>,
    poUspechu?: () => void,
  ): void {
    if (lessonId === null) return;
    setError(null);

    startTransition(async () => {
      const result = await akcia();
      if (!result.ok) {
        setError(result.error ?? "Zmenu sa nepodarilo uložiť.");
        return;
      }

      const znova = await loadLessonDetail(lessonId);
      if (znova.ok) setNacitane({ id: lessonId, data: znova.data });
      poUspechu?.();
    });
  }

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

                {/*
                  Suplovanie sa píše ako veta, nie ako značka. „Namiesto
                  fyziky" povie všetko naraz — že je to zmena aj čo tu malo
                  byť — a človek to prečíta bez toho, aby sa učil, čo ktorý
                  symbol znamená.
                */}
                {lesson.originalSubjectCode !== null ? (
                  <p className="text-mini text-warn">
                    Namiesto{" "}
                    {lesson.originalSubjectName ?? lesson.originalSubjectCode}
                  </p>
                ) : null}

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

              {/*
                SUPLOVANIE

                Zapisuje sa priamo do hodiny: predmet, učiteľ a učebňa vždy
                hovoria, čo sa v ten deň NAOZAJ deje. Mriežka aj rozpočet tak
                ukazujú skutočnosť bez toho, aby o suplovaní čokoľvek vedeli.
              */}
              {meniSa ? (
                <div className="flex flex-col gap-2 rounded border border-border bg-surface-2/40 p-3">
                  <h3 className="label text-fg-subtle">Čo je namiesto toho</h3>

                  <Select
                    value={lesson.subjectId}
                    onValueChange={(subjectId) =>
                      uloz(() => setLessonSubstitution(lesson.id, { subjectId }))
                    }
                  >
                    <SelectTrigger aria-label="Predmet, ktorý naozaj bude">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((predmet) => (
                        <SelectItem key={predmet.id} value={predmet.id}>
                          {predmet.name ?? predmet.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={teacherId ?? NIKTO}
                    onValueChange={(hodnota) =>
                      uloz(() =>
                        setLessonSubstitution(lesson.id, {
                          teacherId: hodnota === NIKTO ? null : hodnota,
                        }),
                      )
                    }
                  >
                    <SelectTrigger aria-label="Kto supluje">
                      <SelectValue placeholder="Vyučujúci" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NIKTO}>Nevie sa</SelectItem>
                      <SelectSeparator />
                      {teachers.map((ucitel) => (
                        <SelectItem key={ucitel.id} value={ucitel.id}>
                          {ucitel.name ?? ucitel.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    defaultValue={lesson.room ?? ""}
                    placeholder="Učebňa"
                    aria-label="Učebňa"
                    onBlur={(event) => {
                      const room = event.currentTarget.value.trim();
                      if (room === (lesson.room ?? "")) return;
                      uloz(() => setLessonSubstitution(lesson.id, { room }));
                    }}
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={meniSa ? "primary" : undefined}
                  disabled={isPending}
                  onClick={() => setMeniSaPre(meniSa ? null : lessonId)}
                >
                  <Replace className="size-3.5" />
                  {meniSa ? "Hotovo" : "Zmena"}
                </Button>

                {lesson.originalSubjectCode !== null ? (
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      uloz(() => clearLessonSubstitution(lesson.id), () => setMeniSaPre(null))
                    }
                  >
                    <RotateCcw className="size-3.5" />
                    Zrušiť zmenu
                  </Button>
                ) : null}

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
