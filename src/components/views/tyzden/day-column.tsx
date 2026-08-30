"use client";

import { useOptimistic, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { GripVertical, Repeat } from "lucide-react";

import { AddTaskButton, AddTaskInline } from "@/components/task/add-task-inline";
import { useTaskDetail } from "@/components/task/task-detail-provider";
import {
  WEEKDAYS_SHORT_SK,
  formatDuration,
  formatLongSk,
  parseIsoDate,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@/server/queries/tasks";

/**
 * Jeden deň týždňa.
 *
 * Návrh („Týždeň") kreslí sedem stĺpcov oddelených linkami — nie sedem
 * kariet s medzerami. Rozdiel nie je kozmetický: karta si berie rám aj
 * odsadenie, takže na 1280 px ostane na text dňa okolo 120 px. Bez nich má
 * stĺpec celú svoju šírku a zmestí sa doň názov úlohy.
 *
 * Dnešok nesie accentovú linku (navrchu na počítači, zľava na telefóne),
 * minulé dni sú stlmené, ale ostávajú funkčné — vrátiť úlohu späť sa musí dať.
 *
 * Celý stĺpec je plocha na pustenie úlohy, aby sa dalo mieriť aj mimo
 * existujúcich riadkov (prázdny deň by inak nemal kam prijať). Úlohy sú
 * `useSortable`, nie `useDraggable` — sortable registruje položku zároveň ako
 * droppable a bez toho by `sortableKeyboardCoordinates` nemal z čoho počítať,
 * teda by presun šípkami vôbec nefungoval.
 */
export interface DayColumnProps {
  /** Deň stĺpca ako RRRR-MM-DD. */
  date: string;
  tasks: TaskWithRelations[];
  isToday: boolean;
  /** Deň už bol — stlmí sa. */
  isPastDay: boolean;
  /** Posledný stĺpec nekreslí pravú linku — tú už drží okraj obrazovky. */
  isLast?: boolean;
  /** Koľko minút je v dni k dispozícii; 0 = bez stropu. */
  capacityMin: number;
}

/** Stĺpec musí mať vlastné id droppable plochy, aby sa nepomiešalo s id úloh. */
export function dayDroppableId(date: string): string {
  return `den:${date}`;
}

/** Späť z id droppable plochy na dátum. Pre id úlohy vráti `null`. */
export function dayFromDroppableId(id: string): string | null {
  return id.startsWith("den:") ? id.slice(4) : null;
}

/** Súčet odhadov toho, čo v dni ešte reálne čaká. Hotové už deň nezaťažuje. */
function openEstimateMin(tasks: TaskWithRelations[]): number {
  return tasks.reduce((sum, task) => {
    if (task.status === "done" || task.status === "dropped") return sum;
    return sum + (task.estimateMin ?? 0);
  }, 0);
}

/** Farba bodky priority. Rovnaké priradenie ako všade, kde sa úloha objaví. */
const PRIORITY_DOT: Record<number, string> = { 1: "bg-p1", 2: "bg-p2", 3: "bg-p3" };

/**
 * Riadok úlohy v týždni — rúčka, bodka priority, názov, pod ním odhad.
 *
 * Zámerne **bez zaškrtávacieho políčka**; návrh ho tu nemá. Týždeň je
 * plánovacia plocha: rozhoduje sa v ňom, KEDY sa vec spraví, nie či je
 * hotová. Odškrtnúť sa dá v „Dnes", v projekte alebo v detaile, ktorý sa
 * otvorí ťuknutím na názov. Hotová úloha je prečiarknutá, takže stav vidno.
 */
const rowClass = "flex items-start gap-1.5 px-2 py-[7px]";

/** Rúčka je 24×24 px — minimum podľa WCAG 2.2 SC 2.5.8, ikona ostáva 14 px. */
const handleClass = cn(
  "flex size-6 shrink-0 items-center justify-center rounded md:size-5",
  "text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg-muted",
);

function TaskLine({ task }: { task: TaskWithRelations }) {
  const detail = useTaskDetail();
  const done = task.status === "done" || task.status === "dropped";

  const meta = [
    task.plannedTime !== null ? task.plannedTime.slice(0, 5) : null,
    task.estimateMin !== null ? formatDuration(task.estimateMin) : null,
  ].filter((part): part is string => part !== null);

  return (
    <div className="min-w-0 flex-1">
      <button
        type="button"
        onClick={() => detail?.open(task)}
        className="flex w-full min-w-0 items-center gap-[5px] text-left"
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            PRIORITY_DOT[task.priority] ?? "bg-p3",
          )}
        />
        <span
          className={cn(
            "min-w-0 truncate text-meta",
            done && "text-fg-subtle line-through",
          )}
        >
          {task.title}
        </span>
        {task.recurrenceRule !== null ? (
          <Repeat aria-hidden="true" className="size-3 shrink-0 text-fg-subtle" />
        ) : null}
      </button>

      {meta.length > 0 ? (
        <p className="mt-[3px] font-mono text-micro tabular-nums text-fg-muted">
          {meta.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function SortableTaskRow({ task }: { task: TaskWithRelations }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(rowClass, "border-b border-border", isDragging && "opacity-40")}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Presunúť úlohu ${task.title} na iný deň alebo na iné miesto v dni`}
        title="Presunúť na iný deň alebo preusporiadať"
        // touch-none je nutné, inak si prehliadač na dotyk vezme gesto ako posun stránky.
        className={cn(handleClass, "cursor-grab touch-none active:cursor-grabbing")}
      >
        <GripVertical aria-hidden="true" size={14} />
      </button>

      <TaskLine task={task} />
    </li>
  );
}

/** Náhľad, ktorý sa vezie s kurzorom. Vizuálne to isté ako riadok v stĺpci. */
export function WeekTaskOverlay({ task }: { task: TaskWithRelations }) {
  return (
    <div className={cn(rowClass, "rounded border border-accent bg-surface shadow-lg")}>
      <span aria-hidden="true" className={handleClass}>
        <GripVertical size={14} />
      </span>
      <TaskLine task={task} />
    </div>
  );
}

export function DayColumn({
  date,
  tasks,
  isToday,
  isPastDay,
  isLast = false,
  capacityMin,
}: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDroppableId(date) });

  const [adding, setAdding] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  /*
    Optimistické riadky pridané poľom v tomto stĺpci. Držia sa len počas
    tranzície ukladania — len čo sa vráti prekreslený strom zo servera,
    `useOptimistic` sa vráti na prázdny zoznam a na ich mieste už je skutočná
    úloha. Preto sa nikdy nezobrazia dvakrát.
  */
  const [pending, addPending] = useOptimistic<string[], string>(
    [],
    (state, title) => [...state, title],
  );

  function closeAdding(): void {
    setAdding(false);
    // Fokus sa musí vrátiť na tlačidlo, inak po Escape spadne na `<body>`
    // a tabovanie začína odznova od začiatku stránky.
    addButtonRef.current?.focus();
  }

  const day = parseIsoDate(date);
  // Návrh má v hlavičke stĺpca dvojpísmenovú skratku veľkými („PO"), nie celé
  // slovo — na stĺpec široký 150 px sa „pondelok" aj tak nezmestí.
  const weekdayName = WEEKDAYS_SHORT_SK[day.getDay()] ?? "";
  const totalMin = openEstimateMin(tasks);
  const overloaded = capacityMin > 0 && totalMin > capacityMin;
  const loadLabel = totalMin > 0 ? formatDuration(totalMin) : "—";
  const loadTitle = overloaded
    ? `Odhad ${loadLabel} — viac, než je na deň k dispozícii`
    : `Odhad ${loadLabel}`;

  return (
    // Zámerne `div role="group"`, nie `section` — sedem pomenovaných sekcií by
    // čítačkám pridalo sedem orientačných bodov a zoznam by sa stal neprehľadným.
    <div
      ref={setNodeRef}
      role="group"
      aria-label={`${formatLongSk(date)}${isToday ? " — dnes" : ""}`}
      className={cn(
        "flex min-w-0 flex-col border-b border-border transition-colors duration-100",
        "md:min-h-0 md:flex-1 md:border-b-0",
        !isLast && "md:border-r md:border-border",
        /*
          Dnešok: na počítači linka navrchu stĺpca, na telefóne zľava — v
          zvislom zozname dní by vodorovná linka splynula s deliacimi čiarami
          medzi dňami a nebolo by ju vidieť.
        */
        isToday &&
          "bg-surface shadow-[inset_3px_0_0_var(--accent)] md:shadow-[inset_0_2px_0_var(--accent)]",
        isPastDay && !isToday && "opacity-60",
        isOver && "bg-accent-soft",
      )}
    >
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-4 py-1.5 md:h-9 md:min-h-0 md:gap-1.5 md:px-2 md:py-0">
        {/*
          Deň v hlavičke je odkaz na svoju vlastnú obrazovku.

          Týždeň ukazuje, ČO kedy je; keď sa človek rozhodne jeden deň naozaj
          odpracovať, chce ho mať celý — s rozpočtom, rituálmi aj prioritou
          dňa. Doteraz sa tam dalo dostať len cez „Dnes" a šípky.
        */}
        <Link
          href={{ pathname: "/dnes", query: { den: date } }}
          title={`Otvoriť ${formatLongSk(date)}`}
          className={cn(
            "-mx-1 flex shrink-0 items-center gap-2 rounded px-1 md:gap-1.5",
            "transition-colors duration-100 ease-out hover:bg-surface-2",
          )}
        >
          <span
            className={cn(
              "shrink-0 font-mono text-mini uppercase tracking-[0.12em] md:text-micro",
              isToday ? "font-medium text-accent" : "text-fg-muted",
            )}
          >
            {weekdayName}
          </span>

          <span
            className={cn(
              "shrink-0 font-mono text-row font-semibold tabular-nums md:text-sm",
              isToday ? "text-accent" : "text-fg",
            )}
          >
            {day.getDate()}
          </span>
        </Link>

        {/*
          Pod `md` sú dni pod sebou a accentová linka zľava sa v dlhom zozname
          ľahko prehliadne, takže to tam povie aj slovo. Od `md` je stĺpec
          dnešného dňa medzi ostatnými zreteľný sám a odznak by len uberal
          z úzkej hlavičky.
        */}
        {isToday ? (
          <span className="shrink-0 rounded-[3px] bg-accent-soft px-1.5 py-0.5 font-mono text-micro tracking-[0.08em] text-accent md:hidden">
            dnes
          </span>
        ) : null}

        <span
          title={loadTitle}
          className={cn(
            "ml-auto shrink-0 font-mono text-mini tabular-nums md:text-micro",
            overloaded ? "font-medium text-warn" : "text-fg-subtle",
          )}
        >
          {loadLabel}
        </span>

        {/*
          Viditeľné vždy, nie až pri prejdení myšou: na dotyku hover neexistuje
          a skryté tlačidlo by tam znamenalo žiadne tlačidlo. Pod `md` má plný
          dotykový cieľ 44 px, od `md` je z návrhu 20 px.
        */}
        <AddTaskButton
          ref={addButtonRef}
          date={date}
          aria-expanded={adding}
          onClick={() => {
            if (adding) closeAdding();
            else setAdding(true);
          }}
          className={cn("-mr-2 md:mr-0 md:size-5", adding && "bg-surface-2 text-fg")}
        />
      </div>

      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col">
          {tasks.map((task) => (
            <SortableTaskRow key={task.id} task={task} />
          ))}
        </ul>
      </SortableContext>

      {/*
        Práve ukladané úlohy. Kreslia sa ako riadok bez ovládania — kým sa
        nevrátia zo servera, nemajú id, takže by sa nedali ani odškrtnúť, ani
        ťahať. Pre čítačku sú skryté; o výsledku hovorí `role="status"` priamo
        v poli.
      */}
      {pending.length > 0 ? (
        <ul aria-hidden="true" className="flex flex-col">
          {pending.map((title, index) => (
            <li
              key={`${index}-${title}`}
              className={cn(rowClass, "border-b border-border opacity-60")}
            >
              <span className={handleClass}>
                <GripVertical size={14} />
              </span>
              <span className="min-w-0 flex-1 truncate text-meta text-fg-muted">
                {title}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <AddTaskInline
          date={date}
          onClose={closeAdding}
          onOptimisticAdd={addPending}
          className="px-2 py-1.5"
        />
      ) : null}

      {/*
        Prázdna plocha stĺpca. Musí ostať dosť veľká na to, aby sa do nej dalo
        pustiť — na telefóne však stačí menej: sedem prázdnych dní po 64 px je
        pol obrazovky ničoho.
      */}
      <div className="min-h-11 flex-1 md:min-h-0" />
    </div>
  );
}
