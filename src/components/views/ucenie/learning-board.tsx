"use client";

import { useState, useTransition } from "react";
import { ChevronRight, LoaderCircle, Plus, Sparkles } from "lucide-react";

import { areaColorValue } from "@/components/task/area-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration } from "@/lib/dates";
import { countSk } from "@/lib/sk";
import { cn } from "@/lib/utils";
import {
  archivePillar,
  archiveSkill,
  assignLooseLessons,
  createPillar,
  createSkill,
  deletePillar,
  deleteSkill,
  seedDefaultPillars,
  updatePillar,
  updateSkill,
} from "@/server/actions/learning";

import type { PillarItem, RankLabel, SkillItem } from "./learning-types";
import { focusOnMount } from "./focus-on-mount";
import { LearningControls } from "./learning-controls";
import { MilestoneList } from "./milestone-list";

/* ═══════════════════════════════════════════════════════════════════════════
   UČENIE — TABUĽA

   Pilier je doména, zručnosť je konkrétna vec v nej, lekcia je dokončená
   úloha. Tabuľa ukazuje prvé dve; tretiu iba počíta, lebo lekcia sa nezakladá
   tu — vzniká tým, že dokončíš úlohu s pilierom.

   Prázdny pilier sa NEVYNECHÁVA. „Telo 0" je fakt, nie výčitka, a je to
   najužitočnejší riadok na obrazovke: hovorí, kam si sa tento mesiac nedostal.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Po koľkej lekcii bez zručnosti sa appka opýta. Zhoda s `PYTAJ_SA_PO`. */
const ASK_AFTER = 2;

const RANK_TONE: Record<RankLabel, string> = {
  "začiatok": "text-fg-subtle",
  "základy": "text-fg-muted",
  "v strede": "text-fg-muted",
  "takmer": "text-accent",
  "vie to": "text-success",
};

export interface LearningBoardProps {
  pillars: readonly PillarItem[];
  /** Dĺžka kĺzavého okna v dňoch — do popiskov, aby číslo malo jednotku. */
  windowDays: number;
}

export function LearningBoard({ pillars, windowDays }: LearningBoardProps) {
  const [error, setError] = useState<string | null>(null);
  const zive = pillars.filter((pillar) => !pillar.archived);
  const archiv = pillars.filter((pillar) => pillar.archived);

  if (pillars.length === 0) return <EmptyBoard />;

  return (
    <div className="flex flex-col">
      {error ? (
        <p role="alert" className="border-b border-border px-5 py-2 text-mini text-danger">
          {error}
        </p>
      ) : null}

      {zive.map((pillar) => (
        <PillarSection
          key={pillar.id}
          pillar={pillar}
          windowDays={windowDays}
          onError={setError}
        />
      ))}

      <div className="px-5 py-3">
        <NewPillarForm />
      </div>

      {/*
        Archív je zbalený a dole. Vec, ktorej sa už nevenuješ, nemá zaberať
        miesto hore — ale musí byť vidieť, inak by archivácia bola tichým
        mazaním a nedalo by sa nič vrátiť.
      */}
      {archiv.length > 0 ? (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-5 py-2.5 font-mono text-micro font-medium uppercase tracking-[0.14em] text-fg-muted">
            Archív · {archiv.length}
          </summary>

          {archiv.map((pillar) => (
            <PillarSection
              key={pillar.id}
              pillar={pillar}
              windowDays={windowDays}
              onError={setError}
            />
          ))}
        </details>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRÁZDNA SEKCIA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Predvolené piliere sa **ponúknu**, nezakladajú sa samy.
 *
 * Kto sa nechce učiť nič, nemá pri prvom prihlásení dostať štyri prázdne
 * priehradky na pomazanie. A kto chce, má to na jedno kliknutie namiesto
 * štyroch formulárov.
 */
function EmptyBoard() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4 px-5 py-6">
      <div className="max-w-prose">
        <h2 className="text-row font-semibold text-fg">Zatiaľ tu nič nie je</h2>
        <p className="mt-1 text-pretty text-body leading-normal text-fg-muted">
          Pilier je <span className="font-medium text-fg">doména</span> — Ruky,
          Hudba, Technika. Zručnosť je konkrétna vec v nej: lockpicking,
          píšťalka, SQL. A lekcia nie je nič, čo by si tu zakladal: je to
          dokončená úloha, ktorej si dal pilier.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await seedDefaultPillars();
              if (!result.ok) setError(result.error);
            })
          }
        >
          {isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Začať so štyrmi piliermi
        </Button>
      </div>

      <NewPillarForm />

      {error ? <p className="text-mini text-danger">{error}</p> : null}
    </div>
  );
}

function NewPillarForm() {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="self-start" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Nový pilier
      </Button>
    );
  }

  function submit(): void {
    const trimmed = name.trim();
    if (trimmed === "" || isPending) return;

    setError(null);
    startTransition(async () => {
      const result = await createPillar({ name: trimmed });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setOpen(false);
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
          maxLength={200}
          ref={focusOnMount}
          autoComplete="off"
          aria-label="Názov nového piliera"
          placeholder="Napríklad: Ruky, Hudba, Technika"
        />
        <Button type="submit" variant="primary" disabled={isPending || name.trim() === ""}>
          {isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Pridať
        </Button>
      </div>

      {error ? <p className="text-mini text-danger">{error}</p> : null}
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PILIER
   ═══════════════════════════════════════════════════════════════════════════ */

function PillarSection({
  pillar,
  windowDays,
  onError,
}: {
  pillar: PillarItem;
  windowDays: number;
  onError: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const zive = pillar.skills.filter((skill) => !skill.archived);
  const archiv = pillar.skills.filter((skill) => skill.archived);

  return (
    <section
      aria-label={`Pilier ${pillar.name}`}
      className={cn("border-b border-border", pillar.archived && "opacity-60")}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-[11px]">
        <div className="flex min-w-0 items-center gap-2">
          {/*
            Iba bodka, bez menovky pre čítačku: názov piliera je hneď vedľa
            v nadpise, takže `AreaDot` s menom by ho prečítal druhýkrát —
            a povedal by pritom „oblasť", čo pilier nie je.
          */}
          <span
            aria-hidden="true"
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ backgroundColor: areaColorValue(pillar.color) }}
          />
          <RenameField
            value={pillar.name}
            label={`Názov piliera ${pillar.name}`}
            className="text-body font-semibold"
            onSave={(name) => updatePillar(pillar.id, { name })}
            onError={onError}
          />
        </div>

        <p className="font-mono text-mini tabular-nums text-fg-muted">
          {countSk(pillar.lessons, "lekcia", "lekcie", "lekcií")} za {windowDays} dní
          {pillar.minutes > 0 ? ` · ${formatDuration(pillar.minutes)}` : ""}
          {pillar.withoutEstimate > 0 ? " · časť bez odhadu" : ""}
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {pillar.archived ? null : (
            <Button size="sm" variant="ghost" onClick={() => setAdding((open) => !open)}>
              <Plus className="size-3.5" />
              Zručnosť
            </Button>
          )}

          <LearningControls
            kind="pilier"
            name={pillar.name}
            archived={pillar.archived}
            onArchive={(next) => archivePillar(pillar.id, next)}
            onDelete={() => deletePillar(pillar.id)}
            deleteWarning={"Pilier sa zahodí aj so svojimi zručnosťami a míľnikmi. Úlohy ostanú, len prestanú byť lekciami — späť sa to vrátiť nedá."}
            onError={onError}
          />
        </div>
      </header>

      {pillar.looseLessons >= ASK_AFTER ? (
        <LoosePrompt pillar={pillar} onCreate={() => setAdding(true)} />
      ) : null}

      {adding ? (
        <div className="border-t border-border bg-surface-2/40 px-5 py-3">
          <SkillForm pillarId={pillar.id} onDone={() => setAdding(false)} />
        </div>
      ) : null}

      {pillar.skills.length === 0 ? (
        <p className="px-5 pb-3 text-mini text-fg-muted">
          Bez zručností. Lekcie sa počítajú aj tak — zručnosť pridáva postup,
          nie povolenie učiť sa.
        </p>
      ) : (
        <ul className="flex flex-col">
          {[...zive, ...archiv].map((skill) => (
            <SkillRow
              key={skill.id}
              skill={skill}
              windowDays={windowDays}
              onError={onError}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Otázka po druhej lekcii bez zručnosti.
 *
 * Po prvej je to ešte náhoda, po druhej už zámer — a vtedy má zmysel sa
 * spýtať. Priradenie berie **všetky** lekcie piliera bez zručnosti, nie len
 * tie dve: keď raz povieš, že tie večery patrili k lockpickingu, patrili
 * k nemu aj vlani.
 */
function LoosePrompt({
  pillar,
  onCreate,
}: {
  pillar: PillarItem;
  onCreate: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-accent-soft/40 px-5 py-2.5">
      <p className="min-w-0 text-mini text-fg">
        {countSk(pillar.looseLessons, "lekcia", "lekcie", "lekcií")} v pilieri{" "}
        {pillar.name} ešte {pillar.looseLessons === 1 ? "nemá" : "nemajú"} zručnosť.
      </p>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onCreate}>
          Vytvoriť zručnosť
        </Button>

        {pillar.skills.map((skill) => (
          <Button
            key={skill.id}
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await assignLooseLessons(pillar.id, skill.id);
                if (!result.ok) setError(result.error);
              })
            }
          >
            Priradiť k „{skill.name}“
          </Button>
        ))}
      </div>

      {error ? <p className="w-full text-mini text-danger">{error}</p> : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZRUČNOSŤ
   ═══════════════════════════════════════════════════════════════════════════ */

function SkillRow({
  skill,
  windowDays,
  onError,
}: {
  skill: SkillItem;
  windowDays: number;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const total = skill.milestones.length;

  return (
    <li className={cn("border-t border-border", skill.archived && "opacity-60")}>
      <div className="flex items-center gap-1 pr-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 px-5 py-2 text-left transition-colors duration-100 hover:bg-surface-2"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-fg-subtle transition-transform duration-100",
            open && "rotate-90",
          )}
        />

        <span className="min-w-0 flex-1 truncate text-body text-fg">{skill.name}</span>

        {skill.quiet ? (
          <span
            className="shrink-0 font-mono text-micro uppercase tracking-[0.08em] text-fg-subtle"
            title={`Bez lekcie ${skill.daysSince ?? 0} dní`}
          >
            ticho
          </span>
        ) : null}

        <span
          className={cn(
            "shrink-0 font-mono text-micro uppercase tracking-[0.08em]",
            RANK_TONE[skill.rank],
          )}
        >
          {skill.rank}
        </span>

        <span className="shrink-0 font-mono text-mini tabular-nums text-fg-muted">
          {skill.reached}/{total}
        </span>
      </button>

      <LearningControls
        kind="zručnosť"
        name={skill.name}
        archived={skill.archived}
        onArchive={(next) => archiveSkill(skill.id, next)}
        onDelete={() => deleteSkill(skill.id)}
        deleteWarning={"Zručnosť sa zahodí aj s míľnikmi. Lekcie ostanú lekciami v tom istom pilieri, len bez zručnosti — späť sa to vrátiť nedá."}
        onError={onError}
      />
      </div>

      {open ? (
        <div className="flex flex-col gap-3 border-t border-border bg-surface-2/40 px-5 py-3">
          <RenameField
            value={skill.name}
            label={`Názov zručnosti ${skill.name}`}
            className="text-body font-medium"
            onSave={(name) => updateSkill(skill.id, { name })}
            onError={onError}
          />

          {skill.note ? (
            <p className="text-pretty text-mini leading-normal text-fg-muted">
              {skill.note}
            </p>
          ) : null}

          <p className="font-mono text-mini tabular-nums text-fg-muted">
            {countSk(skill.lessons, "lekcia", "lekcie", "lekcií")} za {windowDays} dní
            {skill.lessonsTotal !== skill.lessons
              ? ` · ${skill.lessonsTotal} celkovo`
              : ""}
            {skill.minutes > 0 ? ` · ${formatDuration(skill.minutes)}` : ""}
            {skill.tempoDays !== null
              ? ` · míľnik zhruba raz za ${skill.tempoDays} dní`
              : ""}
          </p>

          <MilestoneList skillId={skill.id} milestones={skill.milestones} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Založenie zručnosti aj s míľnikmi naraz.
 *
 * Míľniky sa dajú prilepiť rovno tu, lebo tak aj vznikajú: dáš si cieľ do AI
 * alebo si ho vypíšeš na papier a máš zoznam. Zadávať ich potom cez formulár
 * osemkrát za sebou je presne to trenie, kvôli ktorému sa sekcia prestane
 * používať.
 */
function SkillForm({ pillarId, onDone }: { pillarId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [milestones, setMilestones] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(): void {
    const trimmed = name.trim();
    if (trimmed === "" || isPending) return;

    setError(null);
    startTransition(async () => {
      const result = await createSkill({
        pillarId,
        name: trimmed,
        note: note.trim() === "" ? null : note.trim(),
        ...(milestones.trim() === "" ? {} : { milestones }),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setName("");
      setNote("");
      setMilestones("");
      onDone();
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-2"
    >
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={200}
        ref={focusOnMount}
        autoComplete="off"
        aria-label="Názov zručnosti"
        placeholder="Napríklad: lockpicking, píšťalka, SQL"
      />

      <Input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={2000}
        autoComplete="off"
        aria-label="Prečo sa to učíš"
        placeholder="Prečo sa to učíš (nepovinné)"
      />

      <Textarea
        value={milestones}
        onChange={(event) => setMilestones(event.target.value)}
        rows={4}
        aria-label="Míľniky, jeden na riadok"
        placeholder={"Míľniky — jeden na riadok, nepovinné.\nOveriteľné vety, nie čísla úrovní."}
      />

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={isPending || name.trim() === ""}>
          {isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Pridať zručnosť
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Zrušiť
        </Button>
      </div>

      {error ? <p className="text-mini text-danger">{error}</p> : null}
    </form>
  );
}

/**
 * Názov, ktorý sa dá prepísať na mieste.
 *
 * Vyzerá ako text, kým naň človek neklikne — okraj sa ukáže až pri prejdení
 * myšou. Ukladá sa pri opustení poľa alebo Enterom, Escape vráti pôvodné
 * znenie. Rovnaký spôsob má riadok oblasti, takže sa premenovanie v celej
 * appke správa rovnako a netreba sa ho učiť druhýkrát.
 */
function RenameField({
  value,
  label,
  className,
  onSave,
  onError,
}: {
  value: string;
  label: string;
  className?: string;
  onSave: (name: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [, startTransition] = useTransition();

  function save(): void {
    const trimmed = draft.trim();
    /* Prázdne meno ani nezmenené meno nemá čo posielať na server. */
    if (trimmed === "" || trimmed === value) {
      setDraft(value);
      return;
    }

    startTransition(async () => {
      const result = await onSave(trimmed);
      if (!result.ok) {
        setDraft(value);
        onError(result.error);
      }
    });
  }

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      maxLength={200}
      aria-label={label}
      className={cn(
        "h-11 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 sm:h-8",
        "text-fg transition-colors duration-100 ease-out hover:border-border",
        "focus:border-border-strong focus:bg-surface-2",
        className,
      )}
    />
  );
}
