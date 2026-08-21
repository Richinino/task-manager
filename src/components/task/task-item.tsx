"use client";

import { useOptimistic } from "react";
import { CalendarClock, CalendarDays, Folder, Hash, ListChecks, Star } from "lucide-react";

import type { TaskWithRelations } from "@/server/queries/tasks";
import { formatRelativeSk, isPast, parseIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { AreaDot, areaLabel } from "@/components/task/area-dot";
import { EnergyBadge, energyLabel } from "@/components/task/energy-badge";
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
  /** compact = riadok v týždennom stĺpci, full = obrazovka Dnes/Inbox */
  density?: "compact" | "full";
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

interface DateChipProps {
  iso: string;
  kind: "due" | "planned";
  /** Dnešok zo servera — „dnes"/„zajtra" sa nesmie po hydratácii zmeniť. */
  now: Date;
  overdue?: boolean;
  size?: "sm" | "md";
}

function DateChip({ iso, kind, now, overdue = false, size = "md" }: DateChipProps) {
  const text = formatRelativeSk(iso, now);
  const Icon = kind === "due" ? CalendarClock : CalendarDays;
  const label =
    kind === "due" ? `termín ${text}${overdue ? ", po termíne" : ""}` : `naplánované ${text}`;

  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
        overdue ? "font-medium text-danger" : "text-fg-muted",
        size === "sm" ? "text-mini" : "text-xs",
        DONE_CALM,
      )}
    >
      <Icon aria-hidden="true" size={size === "sm" ? 11 : 13} className="shrink-0" />
      {kind === "due" ? `do ${text}` : text}
    </span>
  );
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

  // Lokálna polnoc dneška zo servera. `today(now)` z nej vráti späť presne
  // `todayIso`, takže všetky relatívne výpočty stoja na jednom dni.
  const now = parseIsoDate(todayIso);

  const dueDate = shown.dueDate;
  const plannedDate = shown.plannedDate;
  const overdue = dueDate !== null && !isDone && isPast(dueDate, now);

  const summary = buildSummary(shown, {
    isFrog,
    overdue,
    now,
    postponeWarnAt,
    tags: shownTags,
  });

  const firstTag = shownTags[0];

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
    // `basis-24` nie je kozmetika: s `flex-1` (základ 0) by pri nedostatku
    // miesta zmizol názov úplne a odznaky by si šírku udržali. So základom
    // 96 px sa o tesno delia obaja a názov ostáva čitateľný.
    "min-w-0 shrink grow basis-24 text-left",
    compact ? "line-clamp-2 break-words text-xs leading-snug" : "truncate",
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
      title={openDetail ? `Otvoriť detail úlohy „${task.title}"` : undefined}
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
      density={density}
      onOptimistic={applyPatch}
      onDiscard={discard.discard}
    />
  );

  const frogMark = isFrog ? (
    <Star
      aria-hidden="true"
      size={compact ? 11 : 14}
      className="shrink-0 fill-current text-frog"
    />
  ) : null;

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

  /* ── full: jeden riadok pre obrazovky Dnes a Inbox ────────────────────── */
  return (
    <TaskCheckbox
      taskId={task.id}
      done={isDone}
      title={task.title}
      size="md"
      rowRole="group"
      rowLabel={summary}
      className={cn(
        "flex w-full items-center gap-2 rounded border border-transparent px-2 py-1.5 text-sm",
        // Na telefóne má riadok 44 px na výšku, aby sa doň zmestili dotykové
        // plochy políčka a menu bez toho, aby zasahovali do susedných riadkov.
        // Od `sm:` sa hustota vracia na pôvodnú.
        "min-h-11 sm:min-h-0",
        "transition-colors",
        // Riadok priority dňa a vybraný riadok si držia svoje pozadie,
        // spätnú väzbu dá okraj.
        !isFrog && !selected && "hover:bg-surface-2",
        isFrog && "bg-frog-soft hover:border-frog",
        selected && "border-accent bg-accent-soft",
      )}
    >
      <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
        {frogMark}
        <PriorityDot priority={shown.priority} />
      </span>

      {titleNode}

      {/*
        Odznaky sú už v zhrnutí riadku — pre čítačky ich neopakujeme.

        Na telefóne sa ich do riadku zmestí len hŕstka, tak sa časť skrýva.
        Čo ostáva na každej šírke: termín (najmä zmeškaný — je červený a je to
        jediná informácia, kvôli ktorej treba konať dnes) a počítadlo odkladov.
        Priorita dňa a priorita samotná sú v ľavej skupine, tie sa neskrývajú
        nikdy. Farebná bodka oblasti ostáva tiež — stojí 8 px.

        Čo mizne do `sm:` (640 px): podúlohy, odhad a energia — to sú čísla
        na plánovanie, nie na rozhodnutie „čo teraz".
        Čo mizne do `md:` (768 px): kontext, názov oblasti a projekt — texty
        premenlivej dĺžky, ktoré berú najviac miesta názvu úlohy.
        Všetko skryté je jedno ťuknutie ďaleko v detaile úlohy.

        `min-w-0` na obale a `shrink` na textových odznakoch je poistka pre
        tablet: keď by aj tam bolo tesno, odznaky sa skrátia tromi bodkami
        namiesto toho, aby riadok pretiekol.
      */}
      <span
        aria-hidden="true"
        className="flex min-w-0 items-center gap-2 text-xs text-fg-muted"
      >
        {task.subtaskCount > 0 ? (
          <span
            title={`podúlohy ${task.doneSubtaskCount} z ${task.subtaskCount}`}
            className={cn(
              "hidden shrink-0 items-center gap-1 whitespace-nowrap sm:inline-flex",
              DONE_CALM,
            )}
          >
            <ListChecks aria-hidden="true" size={13} className="shrink-0" />
            {task.doneSubtaskCount}/{task.subtaskCount}
          </span>
        ) : null}

        {task.estimateMin !== null ? (
          <EstimateChip minutes={task.estimateMin} className="hidden sm:inline-flex" />
        ) : null}

        {task.energy !== null ? (
          <EnergyBadge energy={task.energy} className="hidden sm:inline-flex" />
        ) : null}

        {task.context ? (
          <span
            title={`kontext ${normalizeContext(task.context)}`}
            /*
              Kontext bol schovaný pod 768 px, takže na telefóne — kde sa
              appka používa najviac — nebolo vidno vôbec, kde sa úloha dá
              spraviť. Na úzkej obrazovke je užší, ale je.
            */
            className="max-w-20 min-w-0 shrink truncate md:max-w-28"
          >
            {normalizeContext(task.context)}
          </span>
        ) : null}

        {task.area ? (
          <AreaDot
            color={task.area.color}
            name={task.area.name}
            className="max-w-28 min-w-0 shrink"
            nameClassName="hidden md:block"
          />
        ) : null}

        {task.project ? (
          <span
            title={`projekt ${task.project.name}`}
            className="hidden max-w-32 min-w-0 shrink items-center gap-1 md:inline-flex"
          >
            <Folder aria-hidden="true" size={13} className="shrink-0" />
            <span className="truncate">{task.project.name}</span>
          </span>
        ) : null}

        {/*
          Štítky sú text premenlivej dĺžky — patria teda k tej istej trojici
          ako kontext, oblasť a projekt a miznú spolu s ňou do `md:`. Na 375 px
          by inak zjedli názov úlohy, a pritom je to značka na vyhľadávanie,
          nie signál „toto rieš teraz".

          Kreslí sa VÝHRADNE prvý štítok a za ním počet ostatných: šírka odznaku
          tak ostáva rovnaká pri jednom aj pri desiatich štítkoch. Celý zoznam
          je v `title`, v zhrnutí pre čítačky a na jedno ťuknutie v detaile.
        */}
        {firstTag !== undefined ? (
          <span
            title={`štítky ${shownTags.map((tag) => `#${tag.name}`).join(", ")}`}
            className="hidden max-w-28 min-w-0 shrink items-center gap-0.5 md:inline-flex"
          >
            <Hash aria-hidden="true" size={12} className="shrink-0" />
            <span className="min-w-0 truncate">{firstTag.name}</span>
            {shownTags.length > 1 ? (
              <span className="shrink-0 text-fg-subtle">+{shownTags.length - 1}</span>
            ) : null}
          </span>
        ) : null}

        {showDate && dueDate !== null ? (
          <DateChip iso={dueDate} kind="due" now={now} overdue={overdue} />
        ) : showDate && plannedDate !== null ? (
          <DateChip iso={plannedDate} kind="planned" now={now} />
        ) : null}

        <PostponeBadge
          count={task.postponeCount}
          warnAt={postponeWarnAt}
          dangerAt={postponeBlockAt}
          shortOnPhone
        />
      </span>

      {actions}

      {discard.error ? <RowError message={discard.error} /> : null}
    </TaskCheckbox>
  );
}
