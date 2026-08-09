"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { ArrowLeft, Check, LoaderCircle, Star, Trash2, Undo2, X } from "lucide-react";

import type { Area, Energy, Project, TaskStatus } from "@/db/schema";
import { formatRelativeSk, parseIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { PostponeBadge } from "@/components/task/postpone-badge";
import { PriorityDot } from "@/components/task/priority-dot";
import { SubtaskList } from "@/components/task/subtask-list";
import { TagInput } from "@/components/task/tag-input";
import {
  loadTaskExtras,
  type SubtaskView,
  type TagView,
} from "@/components/task/task-detail-data";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteTask,
  rescheduleTask,
  setFrog,
  toggleTaskDone,
  updateTask,
} from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   PANEL S DETAILOM ÚLOHY

   Jediné miesto, kde sa úloha dá naplno upraviť. Nemá tlačidlo „Uložiť" —
   každá zmena sa ukladá sama, hneď, a keď server odmietne, pole sa vráti
   na poslednú potvrdenú hodnotu a povie sa prečo.

   Texty a poznámka sa ukladajú pri opustení poľa alebo Ctrl+Enter; výbery,
   dátumy a prepínače hneď pri zmene.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Rovnaký tvar ako `ActionResult`, len bez väzby na modul s „use server". */
type SaveResult = { ok: true } | { ok: false; error: string };

/** Radix Select neberie prázdny reťazec ako hodnotu — „nič" má vlastný kľúč. */
const NONE = "__none__";

/** Ponuka odhadov v minútach. Vlastná hodnota úlohy sa doplní za behu. */
const ESTIMATE_OPTIONS = [5, 15, 30, 60, 120, 240] as const;

const PRIORITIES = [
  { value: 1, label: "Vysoká" },
  { value: 2, label: "Stredná" },
  { value: 3, label: "Nízka" },
] as const;

const ENERGY_LABELS: Record<Energy, string> = {
  low: "Nízka",
  mid: "Stredná",
  high: "Vysoká",
};

/** Hodnota z výberu je obyčajný reťazec — do databázy pustíme len to, čo pozná. */
function toEnergy(value: string): Energy | null {
  return value === "low" || value === "mid" || value === "high" ? value : null;
}

/** Hodnoty, ktoré sa v paneli dajú meniť. */
interface Draft {
  title: string;
  note: string;
  status: TaskStatus;
  priority: number;
  plannedDate: string | null;
  /** Prázdny reťazec, nie null — `<input type="time">` inak stráca kontrolu. */
  plannedTime: string;
  dueDate: string | null;
  dueTime: string;
  estimateMin: number | null;
  energy: Energy | null;
  context: string;
  projectId: string | null;
  areaId: string | null;
  isFrog: boolean;
  postponeCount: number;
}

/** Stĺpec `time` vracia „15:00:00", `<input type="time">` chce „15:00". */
function toInputTime(value: string | null): string {
  return value === null ? "" : value.slice(0, 5);
}

function toDraft(task: TaskWithRelations): Draft {
  return {
    title: task.title,
    note: task.note ?? "",
    status: task.status,
    priority: task.priority,
    plannedDate: task.plannedDate,
    plannedTime: toInputTime(task.plannedTime),
    dueDate: task.dueDate,
    dueTime: toInputTime(task.dueTime),
    estimateMin: task.estimateMin,
    energy: task.energy,
    context: task.context ?? "",
    projectId: task.projectId,
    areaId: task.areaId,
    isFrog: task.isFrog,
    postponeCount: task.postponeCount,
  };
}

/* ── rozmery polí ──────────────────────────────────────────────────────────
   Dátum, hodina a krížik sa vedľa seba do 375 px nezmestia: samotná trojica
   potrebuje okolo 350 px a na obsah panela ostáva 343. Pod `md` sa preto
   dátum roztiahne na celý riadok a hodina s krížikom padnú pod neho; od `md`
   (bočný panel má 448 px) idú všetky tri vedľa seba ako doteraz.

   Výška 44 px a písmo 16 px platia len pod `md`: menšie písmo v poli si
   mobilné prehliadače vysvetľujú ako „toto sa nedá prečítať" a pri fokuse
   stránku priblížia — a späť sa už samy nevrátia.
   ──────────────────────────────────────────────────────────────────────── */

const dateRowClass = "flex flex-wrap items-center gap-2";

const dateInputClass = cn(
  "h-11 w-full basis-full text-base dark:[color-scheme:dark]",
  "md:h-9 md:w-auto md:min-w-0 md:flex-1 md:basis-auto md:text-sm",
);

const timeInputClass = cn(
  "h-11 w-32 shrink-0 text-base dark:[color-scheme:dark]",
  "md:h-9 md:w-28 md:text-sm",
);

/** Ovládacie prvky panela: palec pod `md`, hustota od `md`. */
const controlClass = "h-11 md:h-9";

/**
 * Položky rozbaleného výberu. Radix ich kreslí v portáli, takže sa k nim
 * inak než cez potomka obsahu dostať nedá — 32 px vysoká položka je pod
 * dotykovou hranicou a v štvorici výberov by sa trafiť nedala.
 */
const selectContentClass = "[&_[role=option]]:h-11 md:[&_[role=option]]:h-8";

/** Prázdne pole znamená „vymazať hodnotu", nie „ulož prázdny reťazec". */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Je to hotový dátum, alebo len medzistav písania?
 *
 * `<input type="date">` posiela zmenu aj vtedy, keď je rok rozpísaný —
 * „0002-08-07" by prešlo validáciou a úloha by odletela do staroveku.
 * Ukladáme preto až od roku 1900; ostatné medzistavy pole zachytí samo.
 */
function isCompleteDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01";
}

export interface TaskDetailProps {
  task: TaskWithRelations;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Panel sa zavrie a volajúci ponúkne vrátenie späť. */
  onDropped: (dropped: { taskId: string; title: string }) => void;
  /** Kam vrátiť fokus po zatvorení — panel nemá spúšťač, z ktorého by to Radix vedel. */
  onRestoreFocus: () => void;
  areas: Area[];
  projects: Project[];
  /** Dnešok z pásma používateľa. Klient si ho nikdy nepočíta sám. */
  todayIso: string;
  postponeWarnAt: number;
  postponeBlockAt: number;
}

export function TaskDetail({
  task,
  open,
  onOpenChange,
  onDropped,
  onRestoreFocus,
  areas,
  projects,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: TaskDetailProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(task));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const titleRef = useRef<HTMLTextAreaElement>(null);

  /*
    Podúlohy a štítky úloha so sebou nenesie — `TaskWithRelations` má len
    ich počty. Dočítavajú sa jedným volaním pri otvorení panela; panel sa
    pri každom otvorení montuje nanovo (`key` v provideri), takže sa načítanie
    spustí vždy pre práve otvorenú úlohu a stav po zatvorení nepretrvá.
  */
  const [subtasks, setSubtasks] = useState<SubtaskView[]>([]);
  const [tags, setTags] = useState<TagView[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<TagView[]>([]);
  const [extrasLoaded, setExtrasLoaded] = useState(false);

  /** Posledný stav potvrdený serverom — sem sa pole vracia, keď zápis zlyhá. */
  const savedRef = useRef<Draft>(toDraft(task));

  const ids = useId();
  const fieldId = (name: string): string => `${ids}-${name}`;

  // Lokálna polnoc dneška zo servera; `formatRelativeSk` z nej odvodí „dnes".
  const now = parseIsoDate(todayIso);
  const isDone = draft.status === "done";

  /*
    Dočítanie podúloh a štítkov. Beží raz na otvorenie panela.

    `cancelled` nie je opatrnosť navyše: panel sa dá zavrieť skôr, než odpoveď
    dorazí, a zápis do stavu odmontovaného komponentu by sa stratil aj s ním.
  */
  useEffect(() => {
    let cancelled = false;

    void loadTaskExtras(task.id)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSubtasks(result.data.subtasks);
        setTags(result.data.tags);
        setTagSuggestions(result.data.suggestions);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Podúlohy a štítky sa nepodarilo načítať.");
      })
      .finally(() => {
        if (!cancelled) setExtrasLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [task.id]);

  /* ── ukladanie ─────────────────────────────────────────────────────────── */

  /** Zapíše hodnotu, ktorú potvrdil server — bez optimistického kroku. */
  function applyConfirmed(changes: Partial<Draft>): void {
    savedRef.current = { ...savedRef.current, ...changes };
    setDraft((previous) => ({ ...previous, ...changes }));
  }

  /**
   * Prekreslí hneď, uloží na pozadí. Keď server odmietne, celý rozpracovaný
   * stav sa vráti na poslednú potvrdenú podobu a zobrazí sa dôvod.
   */
  function commit(
    changes: Partial<Draft>,
    run: () => Promise<SaveResult>,
    fallback: string,
  ): void {
    setDraft((previous) => ({ ...previous, ...changes }));
    setError(null);

    startTransition(async () => {
      const revert = (message: string): void => {
        setDraft(savedRef.current);
        setError(message);
      };

      try {
        const result = await run();
        if (result.ok) {
          savedRef.current = { ...savedRef.current, ...changes };
          return;
        }
        revert(result.error);
      } catch {
        revert(fallback);
      }
    });
  }

  /* ── jednotlivé polia ──────────────────────────────────────────────────── */

  function commitTitle(): void {
    const next = draft.title.trim();
    if (next === savedRef.current.title) return;
    if (next === "") {
      setDraft(savedRef.current);
      setError("Úloha musí mať názov.");
      return;
    }
    commit({ title: next }, () => updateTask(task.id, { title: next }), "Názov sa nepodarilo uložiť.");
  }

  function commitNote(): void {
    const next = draft.note;
    if (next === savedRef.current.note) return;
    commit(
      { note: next },
      () => updateTask(task.id, { note: orNull(next) }),
      "Poznámku sa nepodarilo uložiť.",
    );
  }

  function commitContext(): void {
    const next = draft.context;
    if (next === savedRef.current.context) return;
    commit(
      { context: next },
      () => updateTask(task.id, { context: orNull(next) }),
      "Kontext sa nepodarilo uložiť.",
    );
  }

  /**
   * Deň, na ktorý je úloha naplánovaná, ide cez `rescheduleTask` — iba tá vie
   * rozlíšiť posun dopredu od odkladu a zapísať to do počítadla.
   *
   * Naviac dorovnáva stav: inbox sa filtruje podľa `status`, takže úloha
   * z inboxu by aj s naplánovaným dňom ostala visieť v inboxe.
   */
  function commitPlannedDate(value: string | null): void {
    if (value === savedRef.current.plannedDate) return;

    commit(
      // Priorita dňa je záväzok konkrétneho dňa — presunom prestáva platiť
      // a server ju zhasne. Prepínač preto musí spadnúť spolu s dátumom.
      { plannedDate: value, isFrog: false },
      async () => {
        const moved = await rescheduleTask(task.id, value);
        if (!moved.ok) return moved;
        applyConfirmed({ postponeCount: moved.data.postponeCount });

        if (value !== null && savedRef.current.status === "inbox") {
          const placed = await updateTask(task.id, { status: "todo" });
          if (!placed.ok) return placed;
          applyConfirmed({ status: "todo" });
        }
        return { ok: true };
      },
      "Deň sa nepodarilo zmeniť.",
    );
  }

  function commitPlannedTime(value: string): void {
    if (value === savedRef.current.plannedTime) return;
    commit(
      { plannedTime: value },
      () => updateTask(task.id, { plannedTime: orNull(value) }),
      "Čas sa nepodarilo uložiť.",
    );
  }

  function commitDueDate(value: string | null): void {
    if (value === savedRef.current.dueDate) return;
    commit(
      { dueDate: value },
      () => updateTask(task.id, { dueDate: value }),
      "Termín sa nepodarilo uložiť.",
    );
  }

  function commitDueTime(value: string): void {
    if (value === savedRef.current.dueTime) return;
    commit(
      { dueTime: value },
      () => updateTask(task.id, { dueTime: orNull(value) }),
      "Čas termínu sa nepodarilo uložiť.",
    );
  }

  function toggleDone(): void {
    // Presne to, čo robí server: odškrtnutá úloha sa vracia do „todo",
    // a keď nemá deň ani projekt, patrí späť do inboxu.
    const placed = draft.plannedDate !== null || draft.projectId !== null;
    const next: TaskStatus = isDone ? (placed ? "todo" : "inbox") : "done";
    commit(
      { status: next },
      async () => {
        const result = await toggleTaskDone(task.id);
        return result.ok ? { ok: true } : result;
      },
      "Stav úlohy sa nepodarilo zmeniť.",
    );
  }

  function drop(): void {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteTask(task.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDropped({ taskId: task.id, title: savedRef.current.title });
      } catch {
        setError("Úlohu sa nepodarilo zahodiť. Skús to znova.");
      }
    });
  }

  /* Hláška o chybe sa nezatvára — sama zmizne. */
  useEffect(() => {
    if (error === null) return;
    const timer = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  /* ── odvodené zoznamy ──────────────────────────────────────────────────── */

  // Odhad z parsera („45m") v pevnej ponuke nie je — bez doplnenia by výber
  // ukázal prázdno a prvá zmena čohokoľvek iného by hodnotu ticho zahodila.
  const estimates: number[] = [...ESTIMATE_OPTIONS];
  const currentEstimate = draft.estimateMin;
  if (currentEstimate !== null && !estimates.includes(currentEstimate)) {
    estimates.push(currentEstimate);
    estimates.sort((a, b) => a - b);
  }

  /*
    Zatvorenie panela nesmie zahodiť rozpísaný text. Textové polia sa inak
    ukladajú až pri opustení poľa, lenže Escape ani kliknutie mimo panela blur
    nevyvolá — používateľ by prišiel o práve prepísaný názov a nedozvedel by sa
    o tom. Pri zatváraní preto všetky textové polia dorovnáme.
  */
  function handleOpenChange(next: boolean): void {
    if (!next) {
      commitTitle();
      commitNote();
      commitContext();
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        /*
          Spoločný krížik v rohu je 28 px a sedí v hornom rohu obrazovky —
          na telefóne je to zároveň najmenší aj najhoršie dosiahnuteľný bod
          celého panela. Zatváranie si preto kreslíme sami: vľavo hore veľké
          tlačidlo so šípkou späť (tam ho na Androide ruka hľadá), od `md`
          obvyklý krížik vpravo.
        */
        showClose={false}
        onOpenAutoFocus={(event) => {
          // Fokus patrí názvu — je to najčastejší dôvod, prečo sa panel otvára.
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
        className={cn(
          "flex h-dvh max-h-dvh w-full max-w-none flex-col overflow-hidden rounded-none border-0 p-0",
          // Na širokej obrazovke je to bočný panel pri pravom okraji.
          "md:ml-auto md:mr-0 md:w-[28rem] md:border-l md:border-border",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2 md:px-4 md:py-3">
          <DialogClose
            aria-label="Zavrieť detail úlohy"
            className={cn(
              "inline-flex size-11 shrink-0 items-center justify-center rounded",
              "text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg",
              "md:hidden",
            )}
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </DialogClose>

          <DialogTitle className="min-w-0 truncate">Detail úlohy</DialogTitle>
          {isPending ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin text-fg-subtle"
            />
          ) : null}
          <span className="ml-auto shrink-0">
            <PostponeBadge
              count={draft.postponeCount}
              warnAt={postponeWarnAt}
              dangerAt={postponeBlockAt}
              size="sm"
            />
          </span>

          <DialogClose
            aria-label="Zavrieť"
            className={cn(
              "hidden size-8 shrink-0 items-center justify-center rounded",
              "text-fg-subtle transition-colors duration-100 hover:bg-surface-2 hover:text-fg",
              "md:inline-flex",
            )}
          >
            <X aria-hidden="true" className="size-4" />
          </DialogClose>
        </div>

        <DialogDescription className="sr-only">
          Každá zmena sa ukladá sama, tlačidlo Uložiť tu nie je. Názov a poznámku
          uložíš opustením poľa alebo klávesmi Ctrl a Enter. Escape panel zavrie
          a rozpísaný text pritom uloží — nič sa nestratí.
        </DialogDescription>

        {error !== null ? (
          <p
            role="alert"
            className="shrink-0 border-b border-danger bg-surface px-4 py-2 text-[13px] font-medium text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
          {/* ── názov a poznámka ───────────────────────────────────────── */}
          <div className="flex flex-col gap-1">
            <label htmlFor={fieldId("title")} className="sr-only">
              Názov úlohy
            </label>
            <textarea
              id={fieldId("title")}
              ref={titleRef}
              value={draft.title}
              rows={2}
              maxLength={500}
              spellCheck={false}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, title: event.target.value }))
              }
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                if (event.nativeEvent.isComposing) return;
                // Enter v názve nie je nový riadok, ale potvrdenie —
                // Ctrl+Enter uloží bez toho, aby sa muselo opúšťať pole.
                if (event.ctrlKey || event.metaKey) {
                  event.preventDefault();
                  commitTitle();
                }
              }}
              className={cn(
                "w-full resize-y rounded border border-border bg-surface px-2.5 py-2",
                "text-base font-medium leading-snug text-fg placeholder:text-fg-subtle",
                "transition-colors duration-100 ease-out hover:border-border-strong",
              )}
            />
          </div>

          <Field label="Poznámka" htmlFor={fieldId("note")}>
            <textarea
              id={fieldId("note")}
              value={draft.note}
              rows={4}
              maxLength={10_000}
              placeholder="Detaily, odkazy, ďalší krok…"
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, note: event.target.value }))
              }
              onBlur={commitNote}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                if (event.nativeEvent.isComposing) return;
                if (event.ctrlKey || event.metaKey) {
                  event.preventDefault();
                  commitNote();
                }
              }}
              className={cn(
                "w-full resize-y rounded border border-border bg-surface px-2.5 py-2",
                "text-base leading-relaxed text-fg placeholder:text-fg-subtle md:text-sm",
                "transition-colors duration-100 ease-out hover:border-border-strong",
              )}
            />
          </Field>

          {/* ── kroky ──────────────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <SectionTitle>Kroky</SectionTitle>
            {extrasLoaded ? (
              <SubtaskList
                parentTaskId={task.id}
                subtasks={subtasks}
                setSubtasks={setSubtasks}
              />
            ) : (
              <LoadingLine label="Načítavam podúlohy…" />
            )}
          </section>

          {/* ── kedy ───────────────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <SectionTitle>Kedy</SectionTitle>
            <p className="text-[12px] leading-relaxed text-fg-muted">
              „Naplánované na" je deň, keď to ideš robiť; „termín" je deň, dokedy
              to musí byť hotové.
            </p>

            <Field
              label="Naplánované na"
              htmlFor={fieldId("planned-date")}
              hint={
                draft.plannedDate !== null
                  ? formatRelativeSk(draft.plannedDate, now)
                  : "Bez dňa ostáva úloha v inboxe."
              }
            >
              <div className={dateRowClass}>
                <Input
                  id={fieldId("planned-date")}
                  type="date"
                  value={draft.plannedDate ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((previous) => ({
                      ...previous,
                      plannedDate: value === "" ? null : value,
                    }));
                    if (value === "") commitPlannedDate(null);
                    else if (isCompleteDate(value)) commitPlannedDate(value);
                  }}
                  onBlur={(event) => {
                    const value = event.target.value;
                    commitPlannedDate(isCompleteDate(value) ? value : null);
                  }}
                  className={dateInputClass}
                />
                <div className="flex shrink-0 items-center gap-2">
                  <Input
                    type="time"
                    value={draft.plannedTime}
                    aria-label="Čas, kedy to ideš robiť"
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft((previous) => ({ ...previous, plannedTime: value }));
                      commitPlannedTime(value);
                    }}
                    onBlur={(event) => commitPlannedTime(event.target.value)}
                    className={timeInputClass}
                  />
                  <ClearButton
                    label="Zrušiť naplánovaný deň"
                    disabled={draft.plannedDate === null && draft.plannedTime === ""}
                    onClick={() => {
                      commitPlannedTime("");
                      commitPlannedDate(null);
                    }}
                  />
                </div>
              </div>
            </Field>

            <Field
              label="Termín"
              htmlFor={fieldId("due-date")}
              hint={
                draft.dueDate !== null
                  ? `do ${formatRelativeSk(draft.dueDate, now)}`
                  : "Bez termínu — nikto to odo mňa k dátumu nečaká."
              }
            >
              <div className={dateRowClass}>
                <Input
                  id={fieldId("due-date")}
                  type="date"
                  value={draft.dueDate ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((previous) => ({
                      ...previous,
                      dueDate: value === "" ? null : value,
                    }));
                    if (value === "") commitDueDate(null);
                    else if (isCompleteDate(value)) commitDueDate(value);
                  }}
                  onBlur={(event) => {
                    const value = event.target.value;
                    commitDueDate(isCompleteDate(value) ? value : null);
                  }}
                  className={dateInputClass}
                />
                <div className="flex shrink-0 items-center gap-2">
                  <Input
                    type="time"
                    value={draft.dueTime}
                    aria-label="Hodina termínu"
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft((previous) => ({ ...previous, dueTime: value }));
                      commitDueTime(value);
                    }}
                    onBlur={(event) => commitDueTime(event.target.value)}
                    className={timeInputClass}
                  />
                  <ClearButton
                    label="Zrušiť termín"
                    disabled={draft.dueDate === null && draft.dueTime === ""}
                    onClick={() => {
                      commitDueTime("");
                      commitDueDate(null);
                    }}
                  />
                </div>
              </div>
            </Field>

            <div className="flex items-start gap-2.5">
              <Checkbox
                id={fieldId("frog")}
                checked={draft.isFrog}
                disabled={draft.plannedDate === null}
                onCheckedChange={(checked) =>
                  commit(
                    { isFrog: checked === true },
                    () => setFrog(task.id, checked === true),
                    "Prioritu dňa sa nepodarilo nastaviť.",
                  )
                }
                className="mt-0.5 size-6"
              />
              <label
                htmlFor={fieldId("frog")}
                className={cn(
                  "min-w-0 cursor-pointer text-sm text-fg",
                  draft.plannedDate === null && "cursor-default opacity-45",
                )}
              >
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Star aria-hidden="true" size={14} className="fill-current text-frog" />
                  Priorita dňa
                </span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-fg-muted">
                  {draft.plannedDate === null
                    ? "Prioritou dňa môže byť len úloha s naplánovaným dňom."
                    : "Jedna úloha na deň. Zapnutím ju odoberieš tej doterajšej."}
                </span>
              </label>
            </div>
          </section>

          {/* ── ako ────────────────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <SectionTitle>Ako</SectionTitle>

            <Field label="Priorita">
              <div role="group" aria-label="Priorita úlohy" className="flex gap-1.5">
                {PRIORITIES.map((option) => {
                  const active = draft.priority === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        commit(
                          { priority: option.value },
                          () => updateTask(task.id, { priority: option.value }),
                          "Prioritu sa nepodarilo uložiť.",
                        )
                      }
                      className={cn(
                        "inline-flex flex-1 items-center justify-center gap-1.5 rounded border",
                        controlClass,
                        "text-[13px] font-medium transition-colors duration-100 ease-out",
                        active
                          ? "border-accent bg-accent-soft text-fg"
                          : "border-border bg-surface text-fg-muted hover:border-border-strong",
                      )}
                    >
                      <PriorityDot priority={option.value} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Odhad">
                <Select
                  value={draft.estimateMin === null ? NONE : String(draft.estimateMin)}
                  onValueChange={(value) => {
                    const minutes = value === NONE ? null : Number(value);
                    commit(
                      { estimateMin: minutes },
                      () => updateTask(task.id, { estimateMin: minutes }),
                      "Odhad sa nepodarilo uložiť.",
                    );
                  }}
                >
                  <SelectTrigger aria-label="Odhad trvania" className={controlClass}>
                    <SelectValue placeholder="Bez odhadu" />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    <SelectItem value={NONE}>Bez odhadu</SelectItem>
                    <SelectSeparator />
                    {estimates.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {minutes < 60
                          ? `${minutes} min`
                          : `${minutes / 60} h${minutes % 60 === 0 ? "" : ` ${minutes % 60} min`}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Energia">
                <Select
                  value={draft.energy ?? NONE}
                  onValueChange={(value) => {
                    const energy = toEnergy(value);
                    commit(
                      { energy },
                      () => updateTask(task.id, { energy }),
                      "Energiu sa nepodarilo uložiť.",
                    );
                  }}
                >
                  <SelectTrigger
                    aria-label="Energetická náročnosť"
                    className={controlClass}
                  >
                    <SelectValue placeholder="Neurčená" />
                  </SelectTrigger>
                  <SelectContent className={selectContentClass}>
                    <SelectItem value={NONE}>Neurčená</SelectItem>
                    <SelectSeparator />
                    <SelectItem value="low">{ENERGY_LABELS.low}</SelectItem>
                    <SelectItem value="mid">{ENERGY_LABELS.mid}</SelectItem>
                    <SelectItem value="high">{ENERGY_LABELS.high}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field
              label="Kontext"
              htmlFor={fieldId("context")}
              hint="Kde alebo čím sa to dá spraviť — @pocitac, @telefon, @mesto."
            >
              <Input
                id={fieldId("context")}
                value={draft.context}
                maxLength={64}
                placeholder="@pocitac"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, context: event.target.value }))
                }
                onBlur={commitContext}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  if (event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  commitContext();
                }}
                className="h-11 text-base md:h-9 md:text-sm"
              />
            </Field>
          </section>

          {/* ── kam ────────────────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <SectionTitle>Kam patrí</SectionTitle>

            <Field label="Projekt">
              <Select
                value={draft.projectId ?? NONE}
                onValueChange={(value) => {
                  const projectId = value === NONE ? null : value;
                  commit(
                    { projectId },
                    () => updateTask(task.id, { projectId }),
                    "Projekt sa nepodarilo priradiť.",
                  );
                }}
              >
                <SelectTrigger aria-label="Projekt úlohy" className={controlClass}>
                  <SelectValue placeholder="Bez projektu" />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  <SelectItem value={NONE}>Bez projektu</SelectItem>
                  {projects.length > 0 ? <SelectSeparator /> : null}
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Oblasť">
              <Select
                value={draft.areaId ?? NONE}
                onValueChange={(value) => {
                  const areaId = value === NONE ? null : value;
                  commit(
                    { areaId },
                    () => updateTask(task.id, { areaId }),
                    "Oblasť sa nepodarilo priradiť.",
                  );
                }}
              >
                <SelectTrigger aria-label="Oblasť úlohy" className={controlClass}>
                  <SelectValue placeholder="Bez oblasti" />
                </SelectTrigger>
                <SelectContent className={selectContentClass}>
                  <SelectItem value={NONE}>Bez oblasti</SelectItem>
                  {areas.length > 0 ? <SelectSeparator /> : null}
                  {areas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Štítky"
              hint="Priečne značky naprieč projektmi — pri zachytení stačí napísať #rodina."
            >
              {extrasLoaded ? (
                <TagInput
                  taskId={task.id}
                  tags={tags}
                  setTags={setTags}
                  suggestions={tagSuggestions}
                />
              ) : (
                <LoadingLine label="Načítavam štítky…" />
              )}
            </Field>
          </section>

          {/* Klávesová nápoveda dáva zmysel len tam, kde je klávesnica. */}
          <p
            aria-hidden="true"
            className="hidden flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-fg-subtle sm:flex"
          >
            <span className="inline-flex items-center gap-1">
              <Kbd>Ctrl</Kbd>
              <Kbd>↵</Kbd>
              uložiť text
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>Esc</Kbd>
              zavrieť
            </span>
          </p>
        </div>

        <div
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          className="flex shrink-0 items-center gap-2 border-t border-border bg-surface px-4 pt-3"
        >
          <Button
            type="button"
            variant={isDone ? "secondary" : "primary"}
            onClick={toggleDone}
            className="h-11 flex-1 md:h-9"
          >
            {isDone ? (
              <>
                <Undo2 size={15} aria-hidden="true" />
                Vrátiť späť
              </>
            ) : (
              <>
                <Check size={15} aria-hidden="true" />
                Hotovo
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={drop}
            aria-label={`Zahodiť úlohu ${savedRef.current.title}`}
            className="h-11 text-danger hover:bg-danger/10 hover:text-danger md:h-9"
          >
            <Trash2 size={15} aria-hidden="true" />
            Zahodiť
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DROBNOSTI
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
      {children}
    </h3>
  );
}

interface FieldProps {
  label: string;
  /** Keď pole nie je natívny prvok (Select, skupina tlačidiel), popis je len text. */
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}

function Field({ label, htmlFor, hint, children }: FieldProps) {
  const labelClass = "text-[12px] font-medium text-fg-muted";

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {htmlFor === undefined ? (
        <span className={labelClass}>{label}</span>
      ) : (
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
      )}
      {children}
      {hint !== undefined ? (
        <p className="text-[11px] leading-relaxed text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Miesto, kde sa ešte len dočítava. Drží výšku, aby polia pod ním po načítaní
 * nepodskočili pod prstom.
 */
function LoadingLine({ label }: { label: string }) {
  return (
    <p role="status" className="flex h-9 items-center gap-2 text-[12px] text-fg-subtle">
      <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
      {label}
    </p>
  );
}

/** Vyprázdnenie dátumu musí ísť aj klávesnicou — natívny „clear" nemá každý prehliadač. */
function ClearButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="size-11 shrink-0 md:size-9"
    >
      <X size={15} aria-hidden="true" />
    </Button>
  );
}
