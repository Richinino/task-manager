"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarHeart, Plus } from "lucide-react";

import { useAgendaDetail } from "@/components/agenda/agenda-detail-provider";
import { AgendaRow } from "@/components/agenda/agenda-row";
import { useCaptureOptional } from "@/components/capture/capture-provider";
import { ScreenFooter, ScreenHeader } from "@/components/shell/screen-chrome";
import { Button } from "@/components/ui/button";
import {
  AGENDA_GROUP_LABELS,
  agendaGroup,
  compareAgenda,
  isAgendaPast,
  type AgendaGroup,
} from "@/lib/agenda";
import { cn } from "@/lib/utils";
import type { AgendaItemRow } from "@/server/queries/agenda";

type Filter = "all" | "event" | "deadline" | "school";

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: "all", label: "Všetko" },
  { value: "event", label: "Udalosti" },
  { value: "deadline", label: "Deadliny" },
  { value: "school", label: "Škola" },
];

function matches(item: AgendaItemRow, filter: Filter): boolean {
  if (filter === "event") return item.kind === "event";
  if (filter === "deadline") return item.kind === "deadline";
  if (filter === "school") return item.subjectId !== null;
  return true;
}

function Section({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-[9px] md:px-5">
      <span className="font-mono text-micro font-medium uppercase tracking-[0.14em] text-fg-muted">{label}</span>
      <span className="font-mono text-micro text-fg-subtle">{count}</span>
    </div>
  );
}

/**
 * Obrazovka „Udalosti" — všetko, čo sa stane alebo čo treba stihnúť.
 *
 * Budúce po týždňoch (tento, budúci, neskôr), prebehnuté zbalené dole so
 * známkami. Filter je len pohľad; nič sa ním nemení, preto žije v stave
 * obrazovky a nie v adrese.
 */
export function AgendaList({
  items,
  todayIso,
  weekStartsOn,
  openId = null,
}: {
  items: AgendaItemRow[];
  todayIso: string;
  weekStartsOn: number;
  /** Otvoriť detail tejto udalosti — prišlo z ťuknutia na pripomienku. */
  openId?: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [pastOpen, setPastOpen] = useState(true);
  const capture = useCaptureOptional();
  const detail = useAgendaDetail();
  const router = useRouter();
  const openedRef = useRef<string | null>(null);

  /*
    Detail z notifikácie sa otvorí raz a adresa sa vyčistí — inak by ho
    obnovenie stránky alebo návrat späť otváral znova.
  */
  useEffect(() => {
    if (openId === null || detail === null || openedRef.current === openId) return;
    openedRef.current = openId;
    detail.openById(openId);
    router.replace("/udalosti", { scroll: false });
  }, [openId, detail, router]);

  // Zrušená v zozname ostáva prečiarknutá, ale „pred tebou“ už nie je.
  const counts = useMemo(() => {
    const future = items.filter((i) => !isAgendaPast(i, todayIso) && i.cancelledAt === null);
    return Object.fromEntries(
      FILTERS.map((f) => [f.value, future.filter((i) => matches(i, f.value)).length]),
    ) as Record<Filter, number>;
  }, [items, todayIso]);

  const { groups, past } = useMemo(() => {
    const visible = items.filter((i) => matches(i, filter));
    const future = visible.filter((i) => !isAgendaPast(i, todayIso)).sort(compareAgenda);
    const out: Record<AgendaGroup, AgendaItemRow[]> = { thisWeek: [], nextWeek: [], later: [] };
    for (const item of future) out[agendaGroup(item.date, todayIso, weekStartsOn)].push(item);
    const done = visible.filter((i) => isAgendaPast(i, todayIso)).sort((a, b) => compareAgenda(b, a));
    return { groups: out, past: done };
  }, [items, filter, todayIso, weekStartsOn]);

  const futureTotal = groups.thisWeek.length + groups.nextWeek.length + groups.later.length;

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader
        title="Udalosti"
        meta={`${counts.all} pred tebou`}
      >
        <Button
          variant="primary"
          size="sm"
          onClick={() => capture?.openCapture({ defaultMode: "event" })}
          disabled={capture === null}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          Nová
        </Button>
      </ScreenHeader>

      <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5 md:px-5" role="group" aria-label="Filter">
        {FILTERS.map((f) => {
          const on = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded border px-2.5 text-body md:min-h-7",
                "transition-colors duration-100",
                on
                  ? "border-transparent bg-accent-soft font-medium text-accent"
                  : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              {f.label}
              <span className={cn("font-mono text-mini tabular-nums", on ? "text-accent" : "text-fg-subtle")}>
                {counts[f.value]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1">
        {futureTotal === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <CalendarHeart aria-hidden="true" className="size-6 text-fg-subtle" strokeWidth={1.75} />
            <p className="text-body font-medium text-fg">Pred tebou nič</p>
            <p className="max-w-sm text-meta text-fg-muted">
              Písomku zapíšeš rýchlym zachytením — „písomka MAT piatok“. Deň a hodinu doplní rozvrh.
            </p>
          </div>
        ) : (
          (["thisWeek", "nextWeek", "later"] as const).map((group) =>
            groups[group].length === 0 ? null : (
              <section key={group} aria-label={AGENDA_GROUP_LABELS[group]}>
                <Section label={AGENDA_GROUP_LABELS[group]} count={groups[group].length} />
                {groups[group].map((item) => (
                  <AgendaRow key={item.id} item={item} todayIso={todayIso} variant="list" />
                ))}
              </section>
            ),
          )
        )}

        {past.length > 0 ? (
          <section aria-label="Prebehlo">
            <button
              type="button"
              aria-expanded={pastOpen}
              onClick={() => setPastOpen((v) => !v)}
              className="flex w-full items-center gap-2 border-b border-border px-4 py-[9px] text-left md:px-5"
            >
              <span className="font-mono text-micro font-medium uppercase tracking-[0.14em] text-fg-muted">
                Prebehlo
              </span>
              <span className="font-mono text-micro text-fg-subtle">{past.length}</span>
              <span className="ml-auto font-mono text-micro text-fg-subtle">{pastOpen ? "zbaliť" : "rozbaliť"}</span>
            </button>
            {pastOpen
              ? past.map((item) => <AgendaRow key={item.id} item={item} todayIso={todayIso} variant="list" />)
              : null}
          </section>
        ) : null}
      </div>

      <ScreenFooter summary={`${counts[filter]} pred tebou · ${past.length} prebehlo`} />
    </div>
  );
}
