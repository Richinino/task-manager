"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  CircleSlash,
  Lightbulb,
  ListTodo,
  PackageOpen,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { TaskEmpty } from "@/components/task/task-empty";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { restoreIdea } from "@/server/actions/ideas";
import { restoreTask } from "@/server/actions/tasks";
import type { ArchiveKind } from "@/server/queries/archive";

import type { ArchiveFilterValue } from "./archive-filters";
import { pluralSk } from "@/lib/sk";

/* ═══════════════════════════════════════════════════════════════════════════
   ZOZNAM ARCHÍVU

   Úlohy a nápady v jednom zozname, zoradené podľa poslednej zmeny. Dva
   oddelené zoznamy by nútili človeka hľadať dvakrát — pritom otázka je vždy
   tá istá: „čo som to vtedy zahodil?"

   Vrátenie sa ponúka len pri mäkko zmazaných. Hotová úloha sa nevracia
   tlačidlom „vrátiť", ale tým, že sa odškrtne späť na svojej obrazovke —
   a zahodenie je rozhodnutie, ktoré má v zázname ostať.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Jeden riadok archívu. Server ho pošle hotový, klient už nič nedopočítava. */
export interface ArchiveEntry {
  /** Úloha alebo nápad — v spoločnom zozname sa musia rozoznať na prvý pohľad. */
  type: "task" | "idea";
  id: string;
  title: string;
  /** Prečo je vec v archíve. */
  reason: ArchiveKind;
  /** Náznak poznámky alebo tela, keď nejaké je. */
  excerpt: string | null;
  /**
   * Kedy sa to naposledy zmenilo — hotový text zo servera.
   *
   * Dátum sa neskladá tu: klient nepozná pásmo používateľa a `new Date()`
   * po hydratácii by vedelo vypísať iný deň než serverové vykreslenie.
   */
  changedLabel: string;
}

/** Ako sa v riadku pomenuje dôvod, prečo je vec v archíve. */
const REASONS: Record<ArchiveKind, { label: string; Icon: LucideIcon; tone: string }> = {
  done: { label: "Hotové", Icon: CircleCheck, tone: "text-success" },
  dropped: { label: "Zahodené", Icon: CircleSlash, tone: "text-fg-subtle" },
  deleted: { label: "Zmazané", Icon: Trash2, tone: "text-danger" },
};

const TYPES: Record<ArchiveEntry["type"], { label: string; Icon: LucideIcon }> = {
  task: { label: "Úloha", Icon: ListTodo },
  idea: { label: "Nápad", Icon: Lightbulb },
};

/**
 * Prázdny archív nie je porucha, ale výsledok.
 *
 * Každá priehradka má vlastný text, lebo „nič tu nie je" znamená pri každej
 * niečo iné: pri zmazaných je to poriadok, pri hotových len začiatok.
 */
const EMPTY: Record<ArchiveFilterValue, { title: string; description: string }> = {
  vsetko: {
    title: "Archív je zatiaľ prázdny",
    description:
      "Nič uzavreté, nič zahodené, nič zmazané. Nie je to chyba — je to len začiatok. Archív sa naplní sám, ako budeš veci uzatvárať.",
  },
  hotove: {
    title: "Zatiaľ nič hotové",
    description:
      "Prvá odškrtnutá úloha pristane presne sem. Je to jediné miesto, kde je po mesiaci vidieť, čo si naozaj spravil — nie čo si si naplánoval.",
  },
  zahodene: {
    title: "Nič zahodené",
    description:
      "Nič si vedome nezahodil. Zahodiť vec je plnohodnotné rozhodnutie a tu ostane zapísané — aby si o pol roka vedel, prečo si to nakoniec nerobil.",
  },
  zmazane: {
    title: "V koši nič neleží",
    description:
      "Nemáš čo vracať, a to je dobrá správa. Zmazané veci sa tu držia práve preto, aby sa dali vrátiť — kým sem nič nepribudne, netreba nič riešiť.",
  },
};

/** Stabilná referencia, aby sa zoznam skrytých vrátil na prázdno bez prekreslenia. */
const NOTHING_HIDDEN: readonly string[] = [];

export interface ArchiveListProps {
  /** Riadky vybranej priehradky, od naposledy zmenených. */
  entries: readonly ArchiveEntry[];
  /** Otvorená priehradka — rozhoduje o texte prázdneho stavu. */
  filter: ArchiveFilterValue;
}

export function ArchiveList({ entries, filter }: ArchiveListProps) {
  const router = useRouter();

  /*
    Vrátená vec zmizne z riadku hneď, ešte pred odpoveďou servera.

    Prečo obyčajný `useState` a nie `useOptimistic`: `restoreTask`
    a `restoreIdea` revalidujú svoje obrazovky, ale `/archiv` medzi nimi nie je
    a serverovú vrstvu tu meniť nesmieme. Optimistický stav by sa po dobehnutí
    prechodu vrátil k dátam, ktoré sa nemali odkiaľ obnoviť, a riadok by
    preblikol späť. Čerstvé dáta si preto vypýtame `router.refresh()`.
  */
  const [hidden, setHidden] = useState<readonly string[]>(NOTHING_HIDDEN);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  /*
    Nové dáta zo servera rušia skrývanie.

    Vrátená vec z priehradky „Zmazané" odíde, ale vo „Všetko" sa má objaviť
    znova — už ako hotová alebo zahodená. Bez tohto by ju držal skrytú starý
    zoznam identifikátorov a vyzeralo by to, akoby sa vrátenie nepodarilo.
  */
  useEffect(() => {
    // Preverená výnimka: beží pri novej dávke dát zo servera, nie v slučke.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(NOTHING_HIDDEN);
  }, [entries]);

  useEffect(() => {
    if (error === null) return;
    const timer = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (flash === null) return;
    const timer = window.setTimeout(() => setFlash(null), 5000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const restore = useCallback(
    (entry: ArchiveEntry) => {
      const name = entry.title.trim();
      const noun = entry.type === "task" ? "Úloha" : "Nápad";

      setError(null);
      setFlash(null);
      setHidden((current) =>
        current.includes(entry.id) ? current : [...current, entry.id],
      );

      startTransition(async () => {
        try {
          const result =
            entry.type === "task"
              ? await restoreTask(entry.id)
              : await restoreIdea(entry.id);

          if (!result.ok) {
            // Riadok sa musí vrátiť — inak by vec z obrazovky zmizla, hoci na
            // serveri ostala presne tam, kde bola.
            setHidden((current) => current.filter((id) => id !== entry.id));
            setError(result.error);
            return;
          }

          setFlash(`${noun} „${name}“ je späť medzi živými.`);
          router.refresh();
        } catch {
          setHidden((current) => current.filter((id) => id !== entry.id));
          setError("Vrátiť sa to nepodarilo. Skús to znova.");
        }
      });
    },
    [router],
  );

  const visible = entries.filter((entry) => !hidden.includes(entry.id));
  const empty = EMPTY[filter];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {error === null ? null : (
        <p
          role="status"
          className="rounded border border-danger bg-surface px-3 py-2 text-body font-medium break-words text-danger"
        >
          {error}
        </p>
      )}

      {/* Oblasť je pripojená stále — čítačka ohlási len tú, ktorá už v DOM bola,
          keď sa jej obsah zmení. */}
      <div role="status" aria-live="polite">
        {flash === null ? null : (
          <p className="rounded border border-border bg-surface-2 px-3 py-2 text-body break-words text-fg-muted">
            {flash}
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <TaskEmpty
          icon={<PackageOpen size={26} strokeWidth={1.75} />}
          title={empty.title}
          description={empty.description}
          className="text-left sm:text-center"
        />
      ) : (
        <ul
          aria-label={`${visible.length} ${pluralSk(
            visible.length,
            "vec v archíve",
            "veci v archíve",
            "vecí v archíve",
          )}`}
          className="flex flex-col gap-1.5"
        >
          {visible.map((entry) => (
            <ArchiveRow
              key={`${entry.type}-${entry.id}`}
              entry={entry}
              onRestore={() => restore(entry)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   RIADOK
   ═══════════════════════════════════════════════════════════════════════════ */

interface ArchiveRowProps {
  entry: ArchiveEntry;
  onRestore: () => void;
}

function ArchiveRow({ entry, onRestore }: ArchiveRowProps) {
  const reason = REASONS[entry.reason];
  const type = TYPES[entry.type];
  const ReasonIcon = reason.Icon;
  const TypeIcon = type.Icon;

  return (
    <li className="min-w-0 rounded border border-border bg-surface px-3 py-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <TypeIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-subtle" />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/*
            Názov ostáva plne čitateľný, hoci je vec archivovaná. Stlmiť tu
            všetko by znamenalo stlmiť celú obrazovku — a práve toto je jediné
            miesto, kde sa archív číta zámerne.
          */}
          <p className="min-w-0 text-body leading-snug font-medium break-words text-fg">
            {entry.title}
          </p>

          {entry.excerpt === null ? null : (
            <p className="min-w-0 text-meta leading-snug break-words text-fg-subtle">
              {entry.excerpt}
            </p>
          )}

          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-mini text-fg-subtle">
            <span className={cn("inline-flex shrink-0 items-center gap-1", reason.tone)}>
              <ReasonIcon aria-hidden="true" size={12} className="shrink-0" />
              {reason.label}
            </span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{type.label}</span>
            <span aria-hidden="true">·</span>
            <span className="min-w-0 break-words">zmenené {entry.changedLabel}</span>
          </p>
        </div>

        {entry.reason === "deleted" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onRestore}
            aria-label={`Vrátiť späť ${type.label.toLowerCase()} ${entry.title}`}
            // Jediná záchrana zmazanej veci — na telefóne preto plných 44 px.
            className="h-11 shrink-0 px-3 sm:h-7 sm:px-2"
          >
            <Undo2 aria-hidden="true" size={14} />
            Vrátiť
          </Button>
        ) : null}
      </div>
    </li>
  );
}
