"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Archive, ArrowLeft, LoaderCircle, TriangleAlert } from "lucide-react";

import type { Area } from "@/db/schema";
import { formatRelativeSk, isPast, parseIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { AreaDot } from "@/components/task/area-dot";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateProject } from "@/server/actions/structure";
import type { ProjectWithCounts } from "@/server/queries/structure";

/* ═══════════════════════════════════════════════════════════════════════════
   DETAIL PROJEKTU — UPRAVITEĽNÁ HLAVA

   Rovnaké pravidlá ako v detaile úlohy: žiadne tlačidlo „Uložiť". Každá zmena
   sa ukladá sama a keď server odmietne, pole sa vráti na poslednú potvrdenú
   hodnotu a povie sa prečo. Texty sa ukladajú pri opustení poľa alebo
   Ctrl+Enter, výbery a dátumy hneď pri zmene.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Rovnaký tvar ako `ActionResult`, len bez väzby na modul s „use server". */
type SaveResult = { ok: true } | { ok: false; error: string };

/** Radix Select neberie prázdny reťazec ako hodnotu — „nič" má vlastný kľúč. */
const NONE = "__none__";

const textareaClass = cn(
  "w-full resize-y rounded border border-border bg-surface px-2.5 py-2",
  "text-base leading-relaxed text-fg placeholder:text-fg-subtle sm:text-sm",
  "transition-colors duration-100 ease-out hover:border-border-strong",
);

/** Hodnoty, ktoré sa v hlave projektu dajú meniť. */
interface Draft {
  name: string;
  goal: string;
  definitionOfDone: string;
  areaId: string | null;
  deadline: string | null;
}

function toDraft(project: ProjectWithCounts): Draft {
  return {
    name: project.name,
    goal: project.goal ?? "",
    definitionOfDone: project.definitionOfDone ?? "",
    areaId: project.areaId,
    deadline: project.deadline,
  };
}

/** Prázdne pole znamená „vymazať hodnotu", nie „ulož prázdny reťazec". */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Je to hotový dátum, alebo len medzistav písania?
 *
 * `<input type="date">` posiela zmenu aj vtedy, keď je rok rozpísaný —
 * „0002-08-07" by prešlo validáciou a termín by odletel do staroveku.
 */
function isCompleteDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01";
}

export interface ProjectDetailProps {
  project: ProjectWithCounts;
  /** Aktívne oblasti do výberu. */
  areas: Area[];
  /** Dnešok z pásma používateľa. Klient si ho nikdy nepočíta sám. */
  todayIso: string;
}

export function ProjectDetail({ project, areas, todayIso }: ProjectDetailProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(project));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /** Posledný stav potvrdený serverom — sem sa pole vracia, keď zápis zlyhá. */
  const savedRef = useRef<Draft>(toDraft(project));

  const ids = useId();
  const fieldId = (field: string): string => `${ids}-${field}`;

  const now = parseIsoDate(todayIso);
  const archived = project.archivedAt !== null;

  const total = project.openTaskCount + project.doneTaskCount;
  const deadlineOverdue =
    draft.deadline !== null && !archived && isPast(draft.deadline, now);

  /*
    Oblasť, ktorá je archivovaná alebo zmazaná, sa vo výbere neponúka —
    ale projekt na nej môže stále visieť. Bez doplnenia by výber ukázal
    prázdno a prvá zmena čohokoľvek iného by priradenie ticho zahodila.
  */
  const areaOptions: { id: string; name: string; color: string }[] = areas.map((area) => ({
    id: area.id,
    name: area.name,
    color: area.color,
  }));
  if (
    project.area !== null &&
    !areaOptions.some((option) => option.id === project.area?.id)
  ) {
    areaOptions.push(project.area);
  }

  /* ── ukladanie ───────────────────────────────────────────────────────────── */

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

  function commitName(): void {
    const next = draft.name.trim();
    if (next === savedRef.current.name) return;
    if (next === "") {
      setDraft(savedRef.current);
      setError("Projekt musí mať názov.");
      return;
    }
    commit(
      { name: next },
      () => updateProject(project.id, { name: next }),
      "Názov sa nepodarilo uložiť.",
    );
  }

  function commitGoal(): void {
    const next = draft.goal;
    if (next === savedRef.current.goal) return;
    commit(
      { goal: next },
      () => updateProject(project.id, { goal: orNull(next) }),
      "Cieľ sa nepodarilo uložiť.",
    );
  }

  function commitDefinitionOfDone(): void {
    const next = draft.definitionOfDone;
    if (next === savedRef.current.definitionOfDone) return;
    commit(
      { definitionOfDone: next },
      () => updateProject(project.id, { definitionOfDone: orNull(next) }),
      "Definíciu hotovo sa nepodarilo uložiť.",
    );
  }

  function commitDeadline(value: string | null): void {
    if (value === savedRef.current.deadline) return;
    commit(
      { deadline: value },
      () => updateProject(project.id, { deadline: value }),
      "Termín sa nepodarilo uložiť.",
    );
  }

  /* Hláška o chybe sa nezatvára — sama zmizne. */
  useEffect(() => {
    if (error === null) return;
    const timer = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const definitionMissing = draft.definitionOfDone.trim() === "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href="/projekty"
          className={cn(
            "-ml-1 inline-flex h-11 items-center gap-1.5 rounded px-1.5 sm:h-8",
            "text-body text-fg-muted transition-colors duration-100 ease-out",
            "hover:bg-surface-2 hover:text-fg",
          )}
        >
          <ArrowLeft aria-hidden="true" size={15} className="shrink-0" />
          Projekty
        </Link>

        {isPending ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-3.5 shrink-0 animate-spin text-fg-subtle"
          />
        ) : null}

        <span className="ml-auto shrink-0 text-mini text-fg-subtle">
          {total === 0
            ? "zatiaľ bez úloh"
            : `hotové ${project.doneTaskCount} z ${total}`}
        </span>
      </div>

      {error !== null ? (
        <p
          role="alert"
          className="rounded border border-danger bg-surface px-3 py-2 text-body font-medium text-danger"
        >
          {error}
        </p>
      ) : null}

      {archived ? (
        <p className="flex items-start gap-2 rounded border border-border bg-surface-2 px-3 py-2 text-body text-fg-muted">
          <Archive aria-hidden="true" size={15} className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            Projekt je archivovaný. Neponúka sa vo výberoch ani v parseri, ale
            jeho úlohy aj história ostávajú. Vrátiť ho späť sa dá dole.
          </span>
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={fieldId("name")} className="sr-only">
          Názov projektu
        </label>
        <input
          id={fieldId("name")}
          value={draft.name}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) =>
            setDraft((previous) => ({ ...previous, name: event.target.value }))
          }
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            if (event.nativeEvent.isComposing) return;
            event.preventDefault();
            commitName();
          }}
          className={cn(
            "w-full rounded border border-border bg-surface px-2.5 py-2",
            "text-lg font-semibold tracking-tight text-fg placeholder:text-fg-subtle",
          )}
        />
      </div>

      {/*
        Prázdna definícia hotovo nie je prázdne pole, ale otvorená otázka —
        preto sa povie nahlas. Projekt bez nej sa nikdy nezavrie: vždy sa nájde
        ešte jedna úloha a nikto nevie povedať, či je to už koniec.
      */}
      {definitionMissing ? (
        <p className="flex items-start gap-2 rounded border border-warn bg-surface px-3 py-2 text-body text-fg">
          <TriangleAlert aria-hidden="true" size={15} className="mt-0.5 shrink-0 text-warn" />
          <span className="min-w-0">
            <span className="font-medium">Projekt nemá definíciu hotovo.</span>{" "}
            Napíš dole jednou vetou, podľa čoho spoznáš, že je uzavretý — inak sa
            nezavrie nikdy.
          </span>
        </p>
      ) : null}

      <Field
        label="Cieľ"
        htmlFor={fieldId("goal")}
        hint="Prečo to robíš. Jedna veta, ktorá prežije aj to, keď sa úlohy zmenia."
      >
        <Textarea
          id={fieldId("goal")}
          value={draft.goal}
          rows={2}
          maxLength={5000}
          placeholder="Napríklad: bývať bližšie k práci a mať kľud."
          onChange={(event) =>
            setDraft((previous) => ({ ...previous, goal: event.target.value }))
          }
          onBlur={commitGoal}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            if (event.nativeEvent.isComposing) return;
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              commitGoal();
            }
          }}
          className={textareaClass}
        />
      </Field>

      <Field
        label="Definícia hotovo"
        htmlFor={fieldId("dod")}
        hint="Podľa čoho spoznáš, že projekt je uzavretý. Musí sa to dať overiť, nie len cítiť."
      >
        <Textarea
          id={fieldId("dod")}
          value={draft.definitionOfDone}
          rows={3}
          maxLength={5000}
          placeholder="Napríklad: kľúče odovzdané, adresa prehlásená, staré bývanie vypratané."
          onChange={(event) =>
            setDraft((previous) => ({
              ...previous,
              definitionOfDone: event.target.value,
            }))
          }
          onBlur={commitDefinitionOfDone}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            if (event.nativeEvent.isComposing) return;
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              commitDefinitionOfDone();
            }
          }}
          className={cn(textareaClass, definitionMissing && "border-warn")}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Oblasť" hint="Okruh života, do ktorého projekt patrí.">
          <Select
            value={draft.areaId ?? NONE}
            onValueChange={(value) => {
              const areaId = value === NONE ? null : value;
              commit(
                { areaId },
                () => updateProject(project.id, { areaId }),
                "Oblasť sa nepodarilo priradiť.",
              );
            }}
          >
            <SelectTrigger aria-label="Oblasť projektu">
              <SelectValue placeholder="Bez oblasti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Bez oblasti</SelectItem>
              {areaOptions.length > 0 ? <SelectSeparator /> : null}
              {areaOptions.map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <AreaDot color={area.color} showName={false} size="sm" />
                    <span className="truncate">{area.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Termín projektu"
          htmlFor={fieldId("deadline")}
          hint={
            draft.deadline !== null
              ? `${deadlineOverdue ? "po termíne — " : ""}${formatRelativeSk(draft.deadline, now)}`
              : "Bez termínu — projekt beží, dokedy treba."
          }
        >
          <Input
            id={fieldId("deadline")}
            type="date"
            value={draft.deadline ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((previous) => ({
                ...previous,
                deadline: value === "" ? null : value,
              }));
              if (value === "") commitDeadline(null);
              else if (isCompleteDate(value)) commitDeadline(value);
            }}
            onBlur={(event) => {
              const value = event.target.value;
              commitDeadline(isCompleteDate(value) ? value : null);
            }}
            className={cn(
                            "dark:[color-scheme:dark]",
              deadlineOverdue && "border-danger",
            )}
          />
        </Field>
      </div>

      <p className="text-mini leading-relaxed text-fg-subtle">
        Tlačidlo „Uložiť“ tu nie je — každá zmena sa ukladá sama. Texty pri
        opustení poľa alebo klávesmi Ctrl a Enter.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DROBNOSTI
   ═══════════════════════════════════════════════════════════════════════════ */

interface FieldProps {
  label: string;
  /** Keď pole nie je natívny prvok (Select), popis je len text. */
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}

function Field({ label, htmlFor, hint, children }: FieldProps) {
  const labelClass = "text-meta font-medium text-fg-muted";

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
        <p className="text-mini leading-relaxed text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
