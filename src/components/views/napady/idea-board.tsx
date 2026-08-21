"use client";

import {
  useCallback,
  useEffect,
  useId,
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronRight, Lightbulb, Undo2 } from "lucide-react";

import { TaskEmpty } from "@/components/task/task-empty";
import { Button } from "@/components/ui/button";
import type { Area } from "@/db/schema";
import { effectiveIdeaStage } from "@/lib/ideas";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  deleteIdea,
  restoreIdea,
  setIdeaStage,
  touchIdea,
  updateIdea,
} from "@/server/actions/ideas";
import type { IdeaWithRelations } from "@/server/queries/ideas";

import { IdeaCard, PendingIdeaCard, type SettableStage } from "./idea-card";
import { IdeaCreateForm } from "./idea-create-form";
import { ideaCountLabel } from "./idea-labels";
import { IncubatorStrip, type IncubatorItem } from "./incubator-strip";
import { PromoteDialog } from "./promote-dialog";

/* ═══════════════════════════════════════════════════════════════════════════
   DOSKA NÁPADOV

   Od `lg` kanban podľa zrenia, pod tým zvislý zoznam so sekciami v tom istom
   poradí. Sú to tie isté komponenty v tom istom poradí DOM — mení sa len to,
   či ich mriežka postaví vedľa seba. Štyri stĺpce sa na 375 px nezmestia
   a zmenšovať ich nemá zmysel: karta, na ktorú sa nedá stlačiť, nie je karta.

   Vyblednuté majú vlastné pásmo, ale nie sú skryté. `faded` je odvodený stav
   nad uloženým `raw`/`incubating` — nápad je stále v hre a dotyk ho vráti späť.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Spoločný tvar odpovede akcií. Zo súboru s `"use server"` sa typ neťahá. */
type IdeaActionResult = { ok: true } | { ok: false; error: string };

/** Stabilná referencia, aby sa optimistický stav vrátil na prázdno. */
const NOTHING_PENDING: readonly string[] = [];

/**
 * Optimistická zmena jedného nápadu.
 *
 * Každý zásah je na serveri zároveň dotyk (`lastTouchedAt`), takže vek padá
 * na nulu a odvodená fáza sa prepočíta — vyblednutý nápad musí zo stĺpca
 * „Vyblednuté" odísť hneď, nie až po odpovedi servera.
 */
type IdeaPatch =
  | { kind: "stage"; id: string; stage: SettableStage }
  | { kind: "spark"; id: string; spark: number }
  | { kind: "touch"; id: string }
  | { kind: "remove"; id: string };

function patchIdeas(
  list: readonly IdeaWithRelations[],
  patch: IdeaPatch,
  fadeAfterDays: number,
): IdeaWithRelations[] {
  if (patch.kind === "remove") {
    return list.filter((idea) => idea.id !== patch.id);
  }

  return list.map((idea) => {
    if (idea.id !== patch.id) return idea;

    const stage = patch.kind === "stage" ? patch.stage : idea.stage;
    const spark = patch.kind === "spark" ? patch.spark : idea.spark;

    return {
      ...idea,
      stage,
      spark,
      staleDays: 0,
      effectiveStage: effectiveIdeaStage(stage, 0, fadeAfterDays),
    };
  });
}

/** Tiché potvrdenie posledného rozhodnutia; pri mazaní aj s cestou späť. */
interface Flash {
  message: string;
  undoIdeaId?: string;
  /** Názov do menovky tlačidla — čítačke pri tabovaní nestačí okolitý text. */
  undoTitle?: string;
}

/** Pri ponuke vrátenia musí byť čas si to rozmyslieť. */
const FLASH_MS = { plain: 5000, undo: 10_000 } as const;

export interface IdeaBoardProps {
  /** Všetky nápady vrátane rozhodnutých, zoradené serverom. */
  ideas: IdeaWithRelations[];
  /** Nápady do pásu „Vráť sa k týmto" — najviac tri. */
  incubator: IncubatorItem[];
  /** Aktívne oblasti do výberu vo formulári. */
  areas: Area[];
  /** Po koľkých dňoch bez dotyku nápad vybledne (`settings.fadeAfterDays`). */
  fadeAfterDays: number;
  /** Po koľkých dňoch sa nápad ozve v inkubátore (`settings.incubatorAfterDays`). */
  incubatorAfterDays: number;
}

export function IdeaBoard({
  ideas,
  incubator,
  areas,
  fadeAfterDays,
  incubatorAfterDays,
}: IdeaBoardProps) {
  const [visible, applyPatch] = useOptimistic(ideas, (state, patch: IdeaPatch) =>
    patchIdeas(state, patch, fadeAfterDays),
  );
  const [pending, addPending] = useOptimistic<readonly string[], string>(
    NOTHING_PENDING,
    (state, title) => [...state, title],
  );

  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [promoting, setPromoting] = useState<IdeaWithRelations | null>(null);

  /*
    Nápady, o ktorých už v inkubátore padlo rozhodnutie.

    Nejde cez `useOptimistic`: pás je samostatný dotaz servera a po dobehnutí
    akcie sa aj tak načíta znova (dotknutý nápad už nie je dosť starý,
    zamietnutý už nie je otvorený). Bežný stav ho skryje okamžite a prípadné
    zvyšné identifikátory po obnove nikomu neprekážajú.
  */
  const [decided, setDecided] = useState<readonly string[]>([]);

  const settledCount = ideas.filter(
    (idea) => idea.effectiveStage === "promoted" || idea.effectiveStage === "rejected",
  ).length;
  /*
    Krátky archív je užitočné vidieť, dlhý by na telefóne len naťahoval
    stránku. Počiatočná hodnota vychádza zo serverových dát, takže sa
    vykreslenie na serveri a po hydratácii nerozíde.
  */
  const [settledOpen, setSettledOpen] = useState(
    () => settledCount > 0 && settledCount <= 4,
  );

  /* Hlášky sa nezatvárajú — samy zmiznú. */
  useEffect(() => {
    if (error === null) return;
    const timer = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (flash === null) return;
    const ms = flash.undoIdeaId ? FLASH_MS.undo : FLASH_MS.plain;
    const timer = window.setTimeout(() => setFlash(null), ms);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const mutate = useCallback(
    (
      patch: IdeaPatch,
      action: () => Promise<IdeaActionResult>,
      fallback: string,
      success?: Flash,
      onFail?: () => void,
    ) => {
      setError(null);
      setFlash(null);

      startTransition(async () => {
        applyPatch(patch);
        try {
          const result = await action();
          if (!result.ok) {
            onFail?.();
            setError(result.error);
            return;
          }
          if (success) setFlash(success);
        } catch {
          onFail?.();
          setError(fallback);
        }
      });
    },
    [applyPatch],
  );

  const changeStage = useCallback(
    (idea: IdeaWithRelations, stage: SettableStage) => {
      const name = idea.title.trim();
      const message =
        stage === "incubating"
          ? `„${name}" necháva zrieť.`
          : stage === "rejected"
            ? `„${name}" je zamietnutý — v zázname ostáva.`
            : `„${name}" je späť medzi čerstvými.`;
      mutate(
        { kind: "stage", id: idea.id, stage },
        () => setIdeaStage(idea.id, stage),
        "Fázu sa nepodarilo zmeniť. Skús to znova.",
        { message },
      );
    },
    [mutate],
  );

  const touch = useCallback(
    (idea: IdeaWithRelations) => {
      mutate(
        { kind: "touch", id: idea.id },
        () => touchIdea(idea.id),
        "Nápad sa nepodarilo osviežiť. Skús to znova.",
        { message: `„${idea.title.trim()}" je znova čerstvo dotknutý.` },
      );
    },
    [mutate],
  );

  const changeSpark = useCallback(
    (idea: IdeaWithRelations, spark: number) => {
      mutate(
        { kind: "spark", id: idea.id, spark },
        () => updateIdea(idea.id, { spark }),
        "Iskru sa nepodarilo uložiť. Skús to znova.",
      );
    },
    [mutate],
  );

  const remove = useCallback(
    (idea: IdeaWithRelations) => {
      const name = idea.title.trim();
      mutate(
        { kind: "remove", id: idea.id },
        () => deleteIdea(idea.id),
        "Nápad sa nepodarilo zmazať. Skús to znova.",
        { message: `„${name}" je zmazaný.`, undoIdeaId: idea.id, undoTitle: name },
      );
    },
    [mutate],
  );

  const undoRemove = useCallback((ideaId: string) => {
    setFlash(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await restoreIdea(ideaId);
        if (!result.ok) setError(result.error);
      } catch {
        setError("Nápad sa nepodarilo vrátiť. Skús to znova.");
      }
    });
  }, []);

  /* ── Inkubátor: tri rozhodnutia ──────────────────────────────────────── */

  const decide = useCallback((ideaId: string) => {
    setDecided((current) =>
      current.includes(ideaId) ? current : [...current, ideaId],
    );
  }, []);

  const undecide = useCallback((ideaId: string) => {
    setDecided((current) => current.filter((id) => id !== ideaId));
  }, []);

  const incubatorKeep = useCallback(
    (idea: IdeaWithRelations) => {
      decide(idea.id);
      mutate(
        { kind: "touch", id: idea.id },
        () => touchIdea(idea.id),
        "Nápad sa nepodarilo osviežiť. Skús to znova.",
        { message: `„${idea.title.trim()}" zreje ďalej — hodiny sú vynulované.` },
        () => undecide(idea.id),
      );
    },
    [decide, mutate, undecide],
  );

  const incubatorDiscard = useCallback(
    (idea: IdeaWithRelations) => {
      decide(idea.id);
      mutate(
        { kind: "stage", id: idea.id, stage: "rejected" },
        () => setIdeaStage(idea.id, "rejected"),
        "Nápad sa nepodarilo zahodiť. Skús to znova.",
        { message: `„${idea.title.trim()}" je zahodený — nájdeš ho vo vybavených.` },
        () => undecide(idea.id),
      );
    },
    [decide, mutate, undecide],
  );

  /* ── Rozdelenie do pásiem ────────────────────────────────────────────── */

  const fresh = visible.filter((idea) => idea.effectiveStage === "raw");
  const ripening = visible.filter((idea) => idea.effectiveStage === "incubating");
  const faded = visible.filter((idea) => idea.effectiveStage === "faded");
  const settled = visible.filter(
    (idea) => idea.effectiveStage === "promoted" || idea.effectiveStage === "rejected",
  );

  const incubatorItems = incubator.filter((item) => !decided.includes(item.idea.id));
  const nothingAtAll = visible.length === 0 && pending.length === 0;

  function cardFor(idea: IdeaWithRelations): ReactNode {
    return (
      <IdeaCard
        key={idea.id}
        idea={idea}
        onSpark={(spark) => changeSpark(idea, spark)}
        onStage={(stage) => changeStage(idea, stage)}
        onTouch={() => touch(idea)}
        onPromote={() => setPromoting(idea)}
        onDelete={() => remove(idea)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <IncubatorStrip
        items={incubatorItems}
        afterDays={incubatorAfterDays}
        onPromote={setPromoting}
        onKeep={incubatorKeep}
        onDiscard={incubatorDiscard}
      />

      <IdeaCreateForm areas={areas} onOptimisticAdd={addPending} />

      {error !== null ? (
        <p
          role="status"
          className="rounded border border-danger bg-surface px-3 py-2 text-[13px] font-medium break-words text-danger"
        >
          {error}
        </p>
      ) : null}

      {/* Oblasť je pripojená stále — čítačka ohlási len tú, ktorá už v DOM
          bola, keď sa jej obsah zmení. */}
      <div role="status" aria-live="polite">
        {flash !== null ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded border border-border bg-surface-2 px-3 py-2 text-[13px] text-fg-muted">
            <span className="min-w-0 break-words">{flash.message}</span>
            {flash.undoIdeaId !== undefined ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => undoRemove(flash.undoIdeaId as string)}
                aria-label={
                  flash.undoTitle
                    ? `Vrátiť späť zmazaný nápad ${flash.undoTitle}`
                    : "Vrátiť späť zmazaný nápad"
                }
                className="h-11 shrink-0 px-3 sm:h-7 sm:px-2"
              >
                <Undo2 aria-hidden="true" size={14} />
                Vrátiť späť
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {nothingAtAll ? (
        <TaskEmpty
          icon={<Lightbulb size={26} strokeWidth={1.75} />}
          title="Zatiaľ žiadny nápad"
          description="Úloha je záväzok — musí sa spraviť. Nápad je možnosť — mohlo by sa. Preto tu nie sú termíny ani priority: nápad nikam nemešká. Zapíš, čo ťa napadlo, daj tomu iskru a nechaj to ležať. Časť sama vyhnije, časť z toho raz spravíš projekt — a to je v poriadku."
          className="text-left sm:text-center"
        />
      ) : (
        <div
          className={cn(
            "grid grid-cols-1 gap-5",
            // Štyri pásma vedľa seba až od `lg`; „Vybavené" je užšie, lebo
            // je to pamäť, nie zoznam na prácu.
            "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.75fr)]",
            "lg:items-start lg:gap-3",
          )}
        >
          <Column
            title="Čerstvé"
            hint="Práve zapísané. Nič sa od nich zatiaľ nečaká."
            count={fresh.length + pending.length}
            emptyText="Nič čerstvé."
          >
            {pending.map((title) => (
              <PendingIdeaCard key={`pending-${title}`} title={title} />
            ))}
            {fresh.map(cardFor)}
          </Column>

          <Column
            title="Zrejú"
            hint="Vedome odložené, aby sa ukázalo, či ťa to drží aj o mesiac."
            count={ripening.length}
            emptyText="Nič nezreje."
          >
            {ripening.map(cardFor)}
          </Column>

          <Column
            title="Vyblednuté"
            hint={`Nikto sa ich nedotkol ${fadeAfterDays} dní. Stále v hre — dotyk ich vráti späť.`}
            count={faded.length}
            emptyText="Nič nevybledlo."
          >
            {faded.map(cardFor)}
          </Column>

          {/* Vybavené: zbalené aj užšie. Je to záznam rozhodnutí, nie zoznam,
              nad ktorým sa pracuje — rozbalené by tlačilo živé nápady dole. */}
          <section aria-labelledby="vybavene-napady" className="flex min-w-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => setSettledOpen((open) => !open)}
              aria-expanded={settledOpen}
              aria-controls="vybavene-napady-zoznam"
              className={cn(
                "inline-flex h-11 w-full items-center gap-1.5 rounded px-1 text-left sm:h-8",
                "transition-colors duration-100 ease-out hover:bg-surface-2",
              )}
            >
              {settledOpen ? (
                <ChevronDown aria-hidden="true" size={14} className="shrink-0 text-fg-subtle" />
              ) : (
                <ChevronRight aria-hidden="true" size={14} className="shrink-0 text-fg-subtle" />
              )}
              <span
                id="vybavene-napady"
                className="min-w-0 truncate text-[11px] font-semibold tracking-wide uppercase text-fg-subtle"
              >
                Vybavené
              </span>
              <CountBadge count={settled.length} />
            </button>

            <div id="vybavene-napady-zoznam" hidden={!settledOpen}>
              {settled.length === 0 ? (
                <p className="rounded border border-dashed border-border px-3 py-4 text-[12px] leading-relaxed text-fg-subtle">
                  Nič povýšené ani zamietnuté.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">{settled.map(cardFor)}</ul>
              )}
            </div>

            {settledOpen ? null : (
              <p className="px-1 text-[11px] leading-relaxed text-fg-subtle">
                {settled.length === 0
                  ? "Zatiaľ nič."
                  : `${ideaCountLabel(settled.length)} povýšených alebo zamietnutých.`}
              </p>
            )}
          </section>
        </div>
      )}

      <PromoteDialog
        idea={promoting}
        onClose={() => setPromoting(null)}
        onPromoted={(title) => {
          // Nápad sa presunie medzi vybavené — nech je hneď vidieť, kam.
          setSettledOpen(true);
          setFlash({ message: `Z nápadu „${title}" je projekt.` });
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PÁSMO

   Na počítači stĺpec, na telefóne sekcia — je to ten istý kus DOM, mriežka ho
   len postaví inak.
   ═══════════════════════════════════════════════════════════════════════════ */

interface ColumnProps {
  title: string;
  hint: string;
  count: number;
  emptyText: string;
  children?: ReactNode;
}

function Column({ title, hint, count, emptyText, children }: ColumnProps) {
  const headingId = useId();
  const empty = count === 0;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex min-w-0 flex-col gap-2",
        // Prázdne pásmo na telefóne len naťahuje stránku; na počítači musí
        // ostať, inak by sa stĺpce pri každom presune preskladali.
        empty && "hidden lg:flex",
      )}
    >
      <div className="min-w-0 px-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2
            id={headingId}
            className="min-w-0 truncate text-[11px] font-semibold tracking-wide uppercase text-fg-subtle"
          >
            {title}
          </h2>
          <CountBadge count={count} />
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-fg-subtle">{hint}</p>
      </div>

      {empty ? (
        <p className="rounded border border-dashed border-border px-3 py-4 text-[12px] text-fg-subtle">
          {emptyText}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <Badge
      aria-hidden="true"
      // Prázdna fáza sa nezvýrazňuje: nula je informácia, nie signál.
      tone={count === 0 ? "neutral" : "accent"}
      className="shrink-0"
    >
      {count}
    </Badge>
  );
}
