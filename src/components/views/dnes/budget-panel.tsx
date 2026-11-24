import { formatDuration } from "@/lib/dates";
import { summarizeAreas } from "@/lib/area-summary";
import { taskCountSk } from "@/lib/sk";
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
  /** Minúty zabraté poradami z kalendára — spolu s udalosťami. */
  meetingMin: number;
  /** Koľko z `meetingMin` sú udalosti, nie porady. Podrobne v `TimeBudget`. */
  eventMin?: number;
  /**
   * Minúty, ktoré si z dňa ešte vezme škola — ZVYŠOK, nie celá.
   * Podrobne v `TimeBudget`.
   */
  schoolMin?: number;
  /** Je v dni celodenná úloha? Vtedy sa rozpočet neráta, ale oznamuje. */
  allDay?: boolean;
  /** Názov viacdňovej udalosti, ktorá deň celý zaberá — ako celodenná úloha. */
  blockedBy?: string | null;
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

function RiadokRozpoctu({ label, minutes, color }: { label: string; minutes: number; color: string }) {
  return (
    <p className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-xs ring-1 ring-border-strong/40 ring-inset"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
      <span className="ml-auto text-fg">{formatDuration(minutes)}</span>
    </p>
  );
}

export function BudgetPanel({
  tasks,
  plannedMin,
  availableMin,
  allDay = false,
  blockedBy = null,
  meetingMin,
  eventMin = 0,
  schoolMin = 0,
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

  const skola = Math.max(0, Math.round(schoolMin));
  const udalostiMin = Math.min(meetingMin, Math.max(0, Math.round(eventMin)));
  const poradyMin = meetingMin - udalostiMin;
  const celkom = availableMin + meetingMin;
  const volne = Math.max(0, availableMin - skola - plannedMin);

  const segmenty: Segment[] = [
    ...(frogMin > 0 ? [{ key: "frog", minutes: frogMin, color: "var(--frog)" }] : []),
    ...areas
      .filter((area) => area.minutes > 0)
      .map((area) => ({
        key: area.id,
        minutes: area.minutes,
        color: areaColorValue(area.color),
      })),
    ...(poradyMin > 0
      ? [{ key: "porady", minutes: poradyMin, color: "var(--border-strong)" }]
      : []),
    ...(udalostiMin > 0
      ? [{ key: "udalosti", minutes: udalostiMin, color: "var(--fg-subtle)" }]
      : []),
    /*
      Škola má vlastný segment a nesplýva s poradami. Sú to dva rôzne druhy
      obsadeného času: poradu vieš presunúť, školu nie — a rozklad má práve
      takéto rozdiely ukazovať.
    */
    ...(skola > 0
      ? [{ key: "skola", minutes: skola, color: "var(--border-strong)" }]
      : []),
    ...(volne > 0 ? [{ key: "volne", minutes: volne, color: "var(--border)" }] : []),
  ];

  return (
    <section aria-labelledby="dnes-rozpocet" className="flex flex-col">
      <h2 id="dnes-rozpocet" className="label mb-2.5 text-fg-subtle">
        Rozpočet času
      </h2>

      {/*
        Smer A: veľké číslo je naplánovaný čas v hodinách („2 h 20"), nie
        holé minúty — 140 sa v hlave na večer prepočítava, „2 h 20" nie.
      */}
      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight">
          {formatDuration(plannedMin)}
        </span>
        <span className="font-mono text-meta text-fg-muted tabular-nums">
          z {formatDuration(celkom)}
        </span>
      </p>

      {segmenty.length > 0 ? (
        <span aria-hidden="true" className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
          {segmenty.map((segment) => (
            <span
              key={segment.key}
              style={{ flex: segment.minutes, backgroundColor: segment.color }}
            />
          ))}
        </span>
      ) : null}

      {/*
        Riadky nesú štvorček farby svojho segmentu, aby sa pruh dal prečítať.
        Úlohy majú farbu prvého segmentu úloh (priorita alebo oblasť).
      */}
      <div className="mt-3 flex flex-col gap-1.5 font-mono text-meta text-fg-muted tabular-nums">
        <RiadokRozpoctu
          label="úlohy"
          minutes={plannedMin}
          color={segmenty.find((s) => s.key !== "porady" && s.key !== "udalosti" && s.key !== "skola" && s.key !== "volne")?.color ?? "var(--accent)"}
        />
        {poradyMin > 0 ? (
          <RiadokRozpoctu label="porady" minutes={poradyMin} color="var(--border-strong)" />
        ) : null}
        {udalostiMin > 0 ? (
          <RiadokRozpoctu label="udalosti" minutes={udalostiMin} color="var(--fg-subtle)" />
        ) : null}
        {skola > 0 ? (
          <RiadokRozpoctu label="škola" minutes={skola} color="var(--border-strong)" />
        ) : null}
        <RiadokRozpoctu label="voľné" minutes={volne} color="var(--border)" />
      </div>

      {/*
        Číslo hore je ZVYŠOK dňa, nie jeho dĺžka — a to sa musí povedať,
        inak vyzerá ako chyba: o štvrtej popoludní hlási dve hodiny, hoci
        v nastaveniach je desať. Bez tejto vety by človek hľadal, kde sa
        stratilo osem hodín.
      */}
      {/*
        Pri celodennej úlohe sa rozpočet neráta, ale oznamuje. Aritmetika by
        hlásila, o koľko si deň „preplánoval“ — a to nie je pravda: deň je
        vyhradený, nie preťažený.
      */}
      <p className="mt-2.5 border-t border-border pt-2.5 text-meta leading-relaxed text-fg-muted">
        {blockedBy !== null ? (
          <span className="font-medium text-fg">Deň zaberá „{blockedBy}“.</span>
        ) : allDay ? (
          <span className="font-medium text-fg">Deň je zabraný celodennou úlohou.</span>
        ) : (
          <>Zostáva z dňa {dayStartHour}:00 – {dayEndHour}:00.</>
        )}{" "}
        Bez odhadu: {taskCountSk(withoutEstimate)}.
      </p>
    </section>
  );
}
