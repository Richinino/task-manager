import { formatDuration } from "@/lib/dates";
import { summarizeAreas } from "@/lib/area-summary";
import { taskCountSk } from "@/components/views/dnes/time-budget";
import { areaColorValue } from "@/components/task/area-dot";

/**
 * Rozpočet času v pravej lište — prvá sekcia návrhu („ROZPOČET ČASU").
 *
 * Tvar je z návrhu doslova: veľké číslo v strojopise, pod ním pruh rozdelený
 * podľa toho, ČÍM je deň zabratý, a pod pruhom tri riadky s číslami vpravo.
 *
 * Pruh nie je jeden ukazovateľ naplnenia, ale **rozklad**. Je to rozdiel,
 * ktorý mení rozhodnutie: osem hodín zabratých prácou sa dá presunúť, osem
 * hodín zabratých poradami nie. Segmenty idú v poradí priorita dňa →
 * jednotlivé oblasti → porady → voľné, a farbu si každý nesie svoju —
 * jantárovú, farbu oblasti, sivú a najsvetlejšiu.
 *
 * Pruh je `aria-hidden`: tie isté čísla sú hneď pod ním v texte.
 */
export interface BudgetPanelProps {
  /** Úlohy dňa — z nich sa počíta rozklad podľa oblastí. */
  tasks: readonly {
    area: { id: string; name: string; color: string } | null;
    estimateMin: number | null;
    isFrog: boolean;
    status: string;
  }[];
  /** Súčet odhadov otvorených úloh dňa. */
  plannedMin: number;
  /** Koľko minút má deň k dispozícii po odrátaní porád. */
  availableMin: number;
  /** Minúty zabraté poradami z kalendára. */
  meetingMin: number;
  /** Koľko dnešných úloh odhad nemá. */
  withoutEstimate: number;
  /** Hodiny dňa z nastavení — do vysvetľujúcej vety pod pruhom. */
  dayStartHour: number;
  dayEndHour: number;
}

interface Segment {
  key: string;
  minutes: number;
  color: string;
}

export function BudgetPanel({
  tasks,
  plannedMin,
  availableMin,
  meetingMin,
  withoutEstimate,
  dayStartHour,
  dayEndHour,
}: BudgetPanelProps) {
  const otvorene = tasks.filter((task) => task.status !== "done");

  /*
    Priorita dňa dostáva vlastný segment, takže sa do rozkladu podľa oblastí
    už nesmie počítať druhýkrát.
  */
  const frogMin = otvorene
    .filter((task) => task.isFrog)
    .reduce((sum, task) => sum + (task.estimateMin ?? 0), 0);

  const { areas } = summarizeAreas(
    otvorene
      .filter((task) => !task.isFrog)
      .map((task) => ({ area: task.area, estimateMin: task.estimateMin })),
  );

  const celkom = availableMin + meetingMin;
  const volne = Math.max(0, availableMin - plannedMin);

  const segmenty: Segment[] = [
    ...(frogMin > 0 ? [{ key: "frog", minutes: frogMin, color: "var(--frog)" }] : []),
    ...areas
      .filter((area) => area.minutes > 0)
      .map((area) => ({
        key: area.id,
        minutes: area.minutes,
        color: areaColorValue(area.color),
      })),
    ...(meetingMin > 0
      ? [{ key: "porady", minutes: meetingMin, color: "var(--border-strong)" }]
      : []),
    ...(volne > 0 ? [{ key: "volne", minutes: volne, color: "var(--border)" }] : []),
  ];

  return (
    <section aria-labelledby="dnes-rozpocet" className="flex flex-col">
      <h2 id="dnes-rozpocet" className="label mb-2.5 text-fg-subtle">
        Rozpočet času
      </h2>

      <p className="flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold tracking-tight tabular-nums">
          {plannedMin}
        </span>
        <span className="font-mono text-meta text-fg-muted tabular-nums">
          / {celkom} min
        </span>
      </p>

      {segmenty.length > 0 ? (
        <span aria-hidden="true" className="mt-2.5 flex h-2 gap-0.5">
          {segmenty.map((segment) => (
            <span
              key={segment.key}
              style={{ flex: segment.minutes, backgroundColor: segment.color }}
              className="rounded-xs"
            />
          ))}
        </span>
      ) : null}

      <div className="mt-2.5 flex flex-col gap-1 font-mono text-mini text-fg-muted tabular-nums">
        <p className="flex">
          <span>úlohy</span>
          <span className="ml-auto text-fg">{formatDuration(plannedMin)}</span>
        </p>
        {meetingMin > 0 ? (
          <p className="flex">
            <span>porady</span>
            <span className="ml-auto text-fg">{formatDuration(meetingMin)}</span>
          </p>
        ) : null}
        <p className="flex">
          <span>voľné</span>
          <span className="ml-auto text-fg">{formatDuration(volne)}</span>
        </p>
      </div>

      <p className="mt-2.5 border-t border-border pt-2.5 text-meta leading-relaxed text-fg-muted">
        Deň {dayStartHour}:00 – {dayEndHour}:00 podľa nastavení. Bez odhadu:{" "}
        {taskCountSk(withoutEstimate)}.
      </p>
    </section>
  );
}
