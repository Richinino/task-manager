"use client";

import { useOptimistic } from "react";
import { ListChecks, Star } from "lucide-react";

import type { TaskWithRelations } from "@/server/queries/tasks";
import { formatDuration, formatRelativeSk, isPast, parseIsoDate } from "@/lib/dates";
import {
  describeRecurrence,
  parseRecurrence,
  type Recurrence,
} from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import { AreaDot, areaLabel } from "@/components/task/area-dot";
import { energyLabel, energyText } from "@/components/task/energy-badge";
import { EstimateChip, estimateLabel } from "@/components/task/estimate-chip";
import {
  POSTPONE_DANGER_AT_DEFAULT,
  POSTPONE_WARN_AT_DEFAULT,
  PostponeBadge,
  postponeLabel,
} from "@/components/task/postpone-badge";
import { PriorityDot, priorityLabel } from "@/components/task/priority-dot";
import {
  DiscardedRow,
  RowError,
  TaskActions,
  useTaskDiscard,
  type TaskRowPatch,
} from "@/components/task/task-actions";
import { FrogToggle } from "@/components/task/frog-toggle";
import { TaskCheckbox } from "@/components/task/task-checkbox";
import { useTaskDetail } from "@/components/task/task-detail-provider";

/**
 * Zdieľané zobrazenie úlohy. Používajú ho Dnes, Inbox aj Týždeň —
 * nikto si nerobí vlastnú kópiu.
 *
 * Je to klientský komponent, lebo `onSelect` je funkcia volaná v prehliadači.
 * Optimistické odškrtnutie rieši `TaskCheckbox`, ktorý nesie obal riadku
 * a cez `data-done` prefarbí text aj odznaky bez ďalšieho stavu.
 */
export interface TaskItemProps {
  task: TaskWithRelations;
  /**
   * Dnešok zo servera ako RRRR-MM-DD, odvodený z `settings.timezone`.
   *
   * Bez neho by si komponent bral `new Date()` až v prehliadači: serverové
   * HTML a hydratácia by sa rozišli („do zajtra" → „do dnes"), riadok by
   * preblikol a čítačka by prečítala iný termín, než je nakoniec v DOM.
   */
  todayIso: string;
  /**
   * compact = riadok v týždennom stĺpci, full = obrazovka Dnes/Inbox,
   * hero = karta priority dňa (návrh má pre ňu vlastný, väčší tvar).
   */
  density?: "compact" | "full" | "hero";
  showDate?: boolean;
  /**
   * Zvýrazniť prioritu dňa (v rozhraní „priorita dňa", v dátach `isFrog`).
   * Názov ostáva `showFrog` kvôli volajúcim komponentom.
   */
  showFrog?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  /** Od koľkých odkladov sa odznak zobrazí — `settings.postponeWarnAt`. */
  postponeWarnAt?: number;
  /** Od koľkých odkladov je odznak červený — `settings.postponeBlockAt`. */
  postponeBlockAt?: number;
  /**
   * Štítky úlohy. Predvolene sa berú z `task.tags`, ktoré nesie
   * `TaskWithRelations` — prop je tu len na prípad, keď ich volajúci
   * potrebuje podať inak. Bez štítkov riadok nezaberie ani pixel navyše.
   */
  tags?: TaskItemTag[];
}

/** Štítok tak, ako ho riadok kreslí — meno stačí, id je len kľúč. */
export interface TaskItemTag {
  id: string;
  name: string;
}

/** Stabilná referencia pre predvolenú hodnotu — inak by sa memo prepočítalo. */
const NO_TAGS: TaskItemTag[] = [];

/** Odškrtnutá úloha má prečiarknutý a stlmený text. */
const DONE_TEXT =
  "group-data-[done=true]/task:text-fg-subtle group-data-[done=true]/task:line-through";

/** Po odškrtnutí prestáva byť termín naliehavý. */
const DONE_CALM =
  "group-data-[done=true]/task:text-fg-subtle group-data-[done=true]/task:font-normal";

/** Kontext sa ukladá aj bez zavináča — v UI ho vždy dopíšeme. */
function normalizeContext(context: string): string {
  const trimmed = context.trim();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

/** Zhrnutie úlohy pre čítačky — farba nikdy nie je jediný nosič informácie. */
function buildSummary(
  task: TaskWithRelations,
  opts: {
    isFrog: boolean;
    overdue: boolean;
    now: Date;
    postponeWarnAt: number;
    tags: TaskItemTag[];
    /** Rozobrané pravidlo opakovania, alebo `null`. */
    recurrence: Recurrence | null;
  },
): string {
  const parts: string[] = [];

  if (opts.isFrog) parts.push("priorita dňa");
  parts.push(priorityLabel(task.priority));

  if (task.estimateMin !== null) parts.push(estimateLabel(task.estimateMin));
  if (task.energy !== null) parts.push(energyLabel(task.energy));
  if (task.context) parts.push(`kontext ${normalizeContext(task.context)}`);
  if (task.area) parts.push(areaLabel(task.area.name));
  if (task.project) parts.push(`projekt ${task.project.name}`);
  // Vizuálne je vidieť len prvý štítok — čítačka ich dostane všetky, tá
  // miestom obmedzená nie je.
  if (opts.tags.length > 0) {
    parts.push(`štítky ${opts.tags.map((tag) => tag.name).join(", ")}`);
  }

  if (task.dueDate) {
    parts.push(
      `termín ${formatRelativeSk(task.dueDate, opts.now)}${opts.overdue ? ", po termíne" : ""}`,
    );
  } else if (task.plannedDate) {
    parts.push(`naplánované ${formatRelativeSk(task.plannedDate, opts.now)}`);
  }

  if (task.subtaskCount > 0) {
    parts.push(`podúlohy ${task.doneSubtaskCount} z ${task.subtaskCount}`);
  }
  // Ikona opakovania v riadku je bez textu — čítačke to musí povedať slovami.
  if (opts.recurrence !== null) {
    parts.push(`opakuje sa ${describeRecurrence(opts.recurrence)}`);
  }
  // Rovnaký prah ako vizuálny odznak — čítačka nesmie hlásiť viac ani menej.
  if (task.postponeCount >= opts.postponeWarnAt) {
    parts.push(postponeLabel(task.postponeCount));
  }

  return `Úloha: ${task.title}. ${parts.join(", ")}.`;
}

/** Prázdna zmena — stabilná referencia pre `useOptimistic`. */
const NO_PATCH: TaskRowPatch = {};

export function TaskItem({
  task,
  todayIso,
  density = "full",
  showDate = false,
  showFrog = true,
  selected = false,
  onSelect,
  postponeWarnAt = POSTPONE_WARN_AT_DEFAULT,
  postponeBlockAt = POSTPONE_DANGER_AT_DEFAULT,
  tags,
}: TaskItemProps) {
  const compact = density === "compact";
  const hero = density === "hero";

  /*
    Štítky prichádzajú priamo v úlohe. Prop ich vie prebiť, ale nikto to
    zatiaľ nepotrebuje — `NO_TAGS` drží stabilnú referenciu, aby sa memo
    neprepočítavalo pri každom prekreslení.
  */
  const shownTags: TaskItemTag[] = tags ?? task.tags ?? NO_TAGS;

  /*
    Zmeny z menu akcií sa prekresľujú okamžite a po dobehnutí akcie sa hodnota
    ticho vráti k údajom zo servera. Držíme ich ako jednu záplatu nad úlohou,
    aby sa dalo naraz zmeniť napríklad deň aj prioritu dňa.
  */
  const [patch, applyPatch] = useOptimistic<TaskRowPatch, TaskRowPatch>(
    NO_PATCH,
    (previous, next) => ({ ...previous, ...next }),
  );

  /*
    Odškrtnutie nejde cez záplatu: vlastní ho `TaskCheckbox`, ktorý obaľuje
    riadok a prefarbí ho cez `data-done`. Kým ho ponúkalo aj menu, držali sa
    tu dve optimistické kópie jedného poľa.
  */
  const isDone = task.status === "done";

  // Úloha tak, ako ju riadok práve kreslí — vrátane ešte neuložených zmien.
  const shown: TaskWithRelations = {
    ...task,
    priority: patch.priority ?? task.priority,
    isFrog: patch.isFrog ?? task.isFrog,
    plannedDate:
      patch.plannedDate !== undefined ? patch.plannedDate : task.plannedDate,
  };

  const discard = useTaskDiscard(task.id);

  // Panel s detailom nemusí byť nad riadkom nasadený — bez neho ostáva názov
  // tým, čím bol doteraz, a nič nespadne.
  const detail = useTaskDetail();

  const isFrog = shown.isFrog && showFrog;

  /*
    Pravidlo sa rozoberá tu, nie v `buildSummary`: potrebuje ho aj odznak
    v riadku, aj súhrn pre čítačku, a rozoberať ten istý reťazec dvakrát
    pri každom prekreslení by bola zbytočná práca.
  */
  const recurrence = parseRecurrence(task.recurrenceRule);

  // Lokálna polnoc dneška zo servera. `today(now)` z nej vráti späť presne
  // `todayIso`, takže všetky relatívne výpočty stoja na jednom dni.
  const now = parseIsoDate(todayIso);

  const dueDate = shown.dueDate;
  const plannedDate = shown.plannedDate;
  const overdue = dueDate !== null && !isDone && isPast(dueDate, now);

  /*
    Termín pre 66 px stĺpec v riadku — holý text, bez ikony, presne ako
    v návrhu („do včera", „do 30. 8."). Naplánovaný deň sa ukazuje len tam,
    kde o dni ide (`showDate`); inde je to šum, ktorý berie miesto názvu.
  */
  const dateCell =
    showDate && dueDate !== null
      ? `do ${formatRelativeSk(dueDate, now)}`
      : showDate && plannedDate !== null
        ? formatRelativeSk(plannedDate, now)
        : null;

  const dateTitle =
    showDate && dueDate !== null
      ? `termín ${formatRelativeSk(dueDate, now)}${overdue ? ", po termíne" : ""}`
      : showDate && plannedDate !== null
        ? `naplánované ${formatRelativeSk(plannedDate, now)}`
        : null;

  const summary = buildSummary(shown, {
    isFrog,
    overdue,
    now,
    postponeWarnAt,
    tags: shownTags,
    recurrence,
  });

  /*
    Zahodenie sa nezapisuje hneď — riadok sa najprv premení na pásik s ponukou
    vrátenia. Podrobnosti sú pri `useTaskDiscard`.
  */
  if (discard.discarded) {
    return (
      <DiscardedRow title={task.title} compact={compact} onUndo={discard.undo} />
    );
  }

  // Vlastná konštanta, aby sa zúženie typu udržalo aj vnútri callbacku.
  const select = onSelect;

  /*
    `min-w-0` je tu to podstatné: pružná položka má predvolene
    `min-width: auto`, takže by sa odmietla zmenšiť pod šírku svojho textu
    a vytlačila by menu akcií mimo obrazovku. S ním sa názov zmršťuje ako
    prvý a skracuje sa — plný text ostáva v detaile úlohy.

    `break-words` v kompaktnej verzii rieši dlhý reťazec bez medzier: bez neho
    nemá kde zalomiť, `line-clamp-2` ho síce oreže, ale až v druhom riadku
    uprostred znaku.
  */
  const titleClass = cn(
    "min-w-0 text-left",
    compact ? "line-clamp-2 break-words text-xs leading-snug" : "truncate",
    /*
      V karte priority dňa je názov 16 px polotučne a nesmie rásť do výšky:
      stojí v stĺpci nad riadkom s údajmi, takže `grow` by kartu roztiahlo.
    */
    hero && "text-base font-semibold tracking-tight",
    /*
      V riadku naopak `basis-24` nie je kozmetika: s `flex-1` (základ 0) by
      pri nedostatku miesta zmizol názov úplne a stĺpce by si šírku udržali.
      So základom 96 px sa o tesno delia obaja a názov ostáva čitateľný.

      Veľkosť z návrhu: na telefóne 15 px polotučne (názov je tam takmer
      jediné, čo v riadku je), od `sm:` 14 px normálne — vtedy má riadok
      vedľa seba päť ďalších stĺpcov a názov v nich nemá kričať.
      Vybraný riadok si polotučné písmo drží aj na počítači.
    */
    !hero && "shrink grow basis-24",
    !compact && !hero && "text-row font-medium sm:text-sm sm:font-normal",
    !compact && !hero && selected && "sm:font-medium",
    DONE_TEXT,
  );

  /**
   * Názov otvára detail úlohy — to je jediné miesto, kde sa dá prepísať text
   * či poznámka. Bez providera padáme späť na pôvodné správanie (výber riadku)
   * a keď nie je ani to, ostáva z názvu obyčajný text.
   *
   * Kliknutie sa zámerne nešíri ďalej: riadok nad nami si mousedown berie ako
   * výber a otvorenie detailu by ho zbytočne ťahalo so sebou.
   */
  const openDetail = detail ? () => detail.open(shown) : null;
  const titleAction = openDetail ?? (select ? () => select(task.id) : null);

  const titleNode = titleAction ? (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        titleAction();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      title={openDetail ? `Otvoriť detail úlohy „${task.title}“` : undefined}
      className={cn(titleClass, "cursor-pointer rounded hover:text-accent")}
    >
      {task.title}
    </button>
  ) : (
    <span className={titleClass}>{task.title}</span>
  );

  const actions = (
    <TaskActions
      task={shown}
      todayIso={todayIso}
      density={compact ? "compact" : "full"}
      onOptimistic={applyPatch}
      onDiscard={discard.discard}
    />
  );

  /*
    Hviezdička sa v plnom riadku kreslí VŽDY (keď je povolená a úloha má deň)
    a dá sa na ňu kliknúť — podrobnosti v `FrogToggle`. V úzkom stĺpci týždňa
    ostáva dekoráciou: má 11 px, dotykový cieľ sa tam nezmestí a riadok je
    zároveň úchyt pre ťahanie, takže tlačidlo vnútri by ho rozbilo.
  */
  const canBeFrog = shown.plannedDate !== null;

  const frogMark = compact ? (
    isFrog ? (
      <Star aria-hidden="true" size={11} className="shrink-0 fill-current text-frog" />
    ) : null
  ) : showFrog && canBeFrog ? (
    <FrogToggle
      taskId={task.id}
      isFrog={isFrog}
      title={task.title}
      onOptimistic={(next) => applyPatch({ isFrog: next })}
    />
  ) : isFrog ? (
    <Star aria-hidden="true" size={14} className="shrink-0 fill-current text-frog" />
  ) : null;

  /* ── hero: karta priority dňa ──────────────────────────────────────────

     V návrhu to nie je riadok so zvýrazneným pozadím, ale samostatná karta:
     väčšie políčko (20), hviezdička v jantárovom štvorci (28), názov 16/600
     a pod ním údaje v jednom strojopisnom riadku. Vpravo bodka priority,
     hlavná akcia a menu.

     Delí sa o `TaskCheckbox` a `TaskActions` so zvyškom, takže odškrtnutie
     aj menu sa správajú rovnako ako v zozname — mení sa len tvar.
  */
  if (hero) {
    return (
      <TaskCheckbox
        taskId={task.id}
        done={isDone}
        title={task.title}
        size="lg"
        rowRole="group"
        rowLabel={summary}
        className={cn(
          "flex items-center gap-3 rounded-md border border-frog bg-frog-soft px-3.5 py-3",
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-frog-tint text-frog">
          {frogMark ?? <Star aria-hidden="true" size={16} className="fill-current" />}
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          {titleNode}

          <span
            aria-hidden="true"
            className="mt-1 flex min-w-0 items-center gap-2.5 truncate font-mono text-meta text-fg-muted"
          >
            {task.area ? (
              <AreaDot
                color={task.area.color}
                name={task.area.name}
                className="min-w-0 shrink font-sans"
                nameClassName="truncate"
              />
            ) : null}
            {task.context ? <span className="shrink-0">{normalizeContext(task.context)}</span> : null}
            {task.estimateMin !== null ? (
              <span className="shrink-0">{formatDuration(task.estimateMin)}</span>
            ) : null}
            {task.energy !== null ? (
              <span className="hidden shrink-0 sm:inline">{energyText(task.energy)}</span>
            ) : null}
          </span>
        </div>

        <PriorityDot priority={shown.priority} />

        {/*
          „Začať" otvára detail — tam sú poznámka, podúlohy a rozdelenie,
          teda všetko, čím sa na úlohe naozaj začne. Vlastný stav „robím to"
          appka nemá, takže by tlačidlo nemalo čo prepnúť.
        */}
        {openDetail ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openDetail();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            className={cn(
              "hidden h-11 shrink-0 cursor-pointer items-center rounded-sm px-3.5 text-sm font-medium sm:h-[30px]",
              "bg-fg text-bg transition-opacity duration-100 ease-out hover:opacity-90 sm:flex",
            )}
          >
            Začať
          </button>
        ) : null}

        {actions}

        {discard.error ? <RowError message={discard.error} /> : null}
      </TaskCheckbox>
    );
  }

  /* ── compact: dvojriadková kartička do ~150 px širokého stĺpca ────────── */
  if (compact) {
    return (
      <TaskCheckbox
        taskId={task.id}
        done={isDone}
        title={task.title}
        size="sm"
        rowRole="group"
        rowLabel={summary}
        className={cn(
          "flex w-full items-start gap-1.5 rounded border border-transparent bg-surface px-1.5 py-1",
          "transition-colors hover:border-border-strong",
          isFrog && "bg-frog-soft",
          selected && "border-accent",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-start gap-1">
            <span aria-hidden="true" className="flex h-4 shrink-0 items-center gap-1">
              {frogMark}
              <PriorityDot priority={shown.priority} size="sm" />
            </span>
            {titleNode}
          </div>
          {/*
            Druhý riadok kartičky. Štítky sem nejdú vôbec — stĺpec týždňa má
            okolo 150 px a text premenlivej dĺžky by z neho vytlačil odhad,
            ktorý je pri plánovaní dňa dôležitejší.
          */}
          {task.estimateMin !== null || task.subtaskCount > 0 ? (
            <span
              aria-hidden="true"
              /*
                `overflow-hidden`, lebo oba odznaky sú `shrink-0`: v úzkom
                stĺpci týždňa by sa dlhý odhad s dlhým počítadlom inak
                vykreslili von z kartičky namiesto toho, aby sa orezali.
              */
              className="flex min-w-0 items-center gap-1.5 overflow-hidden pl-3 text-mini text-fg-muted"
            >
              {task.estimateMin !== null ? (
                <EstimateChip minutes={task.estimateMin} size="sm" />
              ) : null}
              {task.subtaskCount > 0 ? (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap",
                    DONE_CALM,
                  )}
                >
                  <ListChecks aria-hidden="true" size={11} className="shrink-0" />
                  {task.doneSubtaskCount}/{task.subtaskCount}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>

        {/* Aj v úzkom stĺpci týždňa musí byť menu po ruke — práve tam sa
            úloha inak nedá ani zmazať. */}
        {actions}

        {discard.error ? <RowError message={discard.error} /> : null}
      </TaskCheckbox>
    );
  }

  /* ── full: jeden riadok pre obrazovky Dnes a Inbox ─────────────────────

     Rozmery sú doslova z návrhu („Anatómia riadku — čo je vidieť a čo nie"):

       počítač   výška 44, medzera 10, odsadenie 0 20, spodná linka
                 [18 políčko] [24 hviezda] [8 bodka] [názov 1fr]
                 [podúlohy] [kontext] [66 sila/termín] [80 oblasť] [44 odhad] [24 menu]

       telefón   min. 60, medzera 12, odsadenie 8 16, horná linka
                 [24 políčko] [názov + druhý riadok s údajmi] [44 hviezda]

     Pevné šírky sú celý zmysel: v zozname pod sebou tak čísla stoja
     v stĺpci a dajú sa prebehnúť očami. Preto `w-[66px]`, `w-20`, `w-11`
     a nie „nech si to zaberie, koľko chce".

     Jeden DOM pre obe rozloženia drží `sm:contents`: obaly sa od `sm:`
     rozpustia a ich deti sa stanú priamymi bunkami riadku. Poradie, ktoré
     sa medzi telefónom a počítačom líši, rieši `order-*`.
  */
  const energyCell =
    dateCell === null && task.energy !== null ? energyText(task.energy) : null;

  return (
    <TaskCheckbox
      taskId={task.id}
      done={isDone}
      title={task.title}
      size="md"
      rowRole="group"
      rowLabel={summary}
      className={cn(
        "flex w-full items-center border-b border-border text-sm transition-colors",
        "min-h-[60px] gap-3 px-4 py-2",
        "sm:h-11 sm:min-h-0 sm:gap-2.5 sm:px-5 sm:py-0",
        !isFrog && !selected && "hover:bg-surface-2",
        isFrog && "bg-frog-soft",
        // Vybraný riadok: 3 px akcentová linka vľavo + jemné pozadie.
        selected && "border-l-[3px] border-l-accent bg-accent-soft",
        // Po termíne: tá istá 3 px linka, ale tieňom — inak by posunula obsah.
        overdue && !selected && "shadow-[inset_3px_0_0_var(--danger)]",
      )}
    >
      {/*
        Hviezdička. Na počítači stojí hneď za políčkom v 24 px stĺpci, na
        telefóne až úplne vpravo so 44 px plochou pre palec — preto `order`.
        Prázdny stĺpec ostáva aj tam, kde hviezdička nie je, inak by sa
        názvy v zozname nezarovnali.
      */}
      <span
        className={cn(
          "order-1 flex shrink-0 items-center justify-center sm:order-none",
          "size-11 sm:size-6",
        )}
      >
        {frogMark}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-[3px] sm:contents">
        <div className="flex min-w-0 items-center gap-1.5 sm:contents">
          <PriorityDot priority={shown.priority} />
          {titleNode}
        </div>

        {/*
          Údaje. Na telefóne druhý riadok, od `sm:` samostatné bunky.
          Čo je na telefóne inde než na počítači, posúva `order`.
        */}
        <div
          aria-hidden="true"
          className={cn(
            "flex min-w-0 items-center gap-2 font-mono text-meta text-fg-muted",
            "sm:contents",
          )}
        >
          {task.subtaskCount > 0 ? (
            <span
              title={`podúlohy ${task.doneSubtaskCount} z ${task.subtaskCount}`}
              className={cn(
                "order-3 shrink-0 whitespace-nowrap text-mini sm:order-none",
                DONE_CALM,
              )}
            >
              ◱ {task.doneSubtaskCount}/{task.subtaskCount}
            </span>
          ) : null}

          {recurrence !== null ? (
            <span
              title={`opakuje sa ${describeRecurrence(recurrence)}`}
              className="order-4 shrink-0 text-mini text-fg-subtle sm:order-none"
            >
              ↻
            </span>
          ) : null}

          {/*
            Úloha, ktorá patrí svojmu dňu. Značka sedí vedľa opakovania —
            oba sú doplnky k názvu, nie stĺpce, takže sa šírky riadku
            z návrhu nedotknú. Bez nej by sa nedalo zistiť, prečo sa tá
            úloha neobjavuje medzi prepadnutými.
          */}
          {task.staysOnDay ? (
            <span
              title="Patrí svojmu dňu — nepresúva sa a nikdy nie je po termíne"
              className="order-4 shrink-0 text-mini text-fg-subtle sm:order-none"
            >
              ⚓
            </span>
          ) : null}

          {task.context ? (
            <span
              title={`kontext ${normalizeContext(task.context)}`}
              className="order-2 min-w-0 shrink truncate sm:order-none"
            >
              {normalizeContext(task.context)}
            </span>
          ) : null}

          <PostponeBadge
            count={task.postponeCount}
            warnAt={postponeWarnAt}
            dangerAt={postponeBlockAt}
            shortOnPhone
            className="order-5 sm:order-none"
          />

          {/*
            Jeden stĺpec, dve role: termín, a keď ho úloha nemá, sila.
            Sila na telefóne nie je vôbec — je to vstup pre „Čo teraz?",
            nie pre oko.
          */}
          {dateCell !== null ? (
            <span
              className={cn(
                "order-0 shrink-0 whitespace-nowrap text-right sm:order-none sm:w-[66px]",
                overdue ? "font-medium text-danger" : "text-fg-muted",
                DONE_CALM,
              )}
              title={dateTitle ?? undefined}
            >
              {dateCell}
            </span>
          ) : energyCell !== null ? (
            <span
              title={`energia ${energyCell}`}
              className="hidden shrink-0 text-right sm:block sm:w-[66px]"
            >
              {energyCell}
            </span>
          ) : (
            <span aria-hidden="true" className="hidden sm:block sm:w-[66px]" />
          )}

          {task.area ? (
            <AreaDot
              color={task.area.color}
              name={task.area.name}
              className="order-1 min-w-0 shrink font-sans sm:order-none sm:w-20 sm:shrink-0 sm:justify-end"
              nameClassName="truncate"
            />
          ) : (
            <span aria-hidden="true" className="hidden sm:block sm:w-20" />
          )}

          {task.estimateMin !== null ? (
            <span
              title={`odhad ${formatDuration(task.estimateMin)}`}
              className={cn(
                "order-6 shrink-0 whitespace-nowrap text-right sm:order-none sm:w-11 sm:text-fg",
                DONE_CALM,
              )}
            >
              {formatDuration(task.estimateMin)}
            </span>
          ) : (
            <span aria-hidden="true" className="hidden sm:block sm:w-11" />
          )}
        </div>
      </div>

      {/* Menu je podľa návrhu iba na počítači — na telefóne je detail
          jedno ťuknutie ďaleko a riadok má namiesto neho hviezdičku. */}
      <span className="hidden shrink-0 sm:flex sm:w-6 sm:items-center sm:justify-center">
        {actions}
      </span>

      {discard.error ? <RowError message={discard.error} /> : null}
    </TaskCheckbox>
  );
}
