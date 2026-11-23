"use client";

import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { Undo2 } from "lucide-react";

import type { Area, Project } from "@/db/schema";
import { useCapture } from "@/components/capture/capture-provider";
import { areaColorValue } from "@/components/task/area-dot";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addedLabel, swipeTarget } from "@/lib/inbox-card";
import { countSk } from "@/lib/sk";
import { cn } from "@/lib/utils";
import { restoreTask, updateTask } from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

import {
  TRIAGE_ACTIONS,
  TRIAGE_ORDER,
  runTriage,
  type TriageAction,
} from "./triage-actions";

/* ═══════════════════════════════════════════════════════════════════════════
   TRIEDIČKA NA TELEFÓNE

   Predloha: c-struktura.html, obrazovka „Inbox". Jedna biela karta (vec ešte
   nemá farbu), dve sivé spoza nej, pod ňou šesť rozhodnutí v mriežke 3×2.
   Potiahnutie doprava = Dnes, doľava = Niekedy; tlačidlá robia to isté.
   ═══════════════════════════════════════════════════════════════════════════ */

const NOTHING_TRIAGED: readonly string[] = [];
const EXIT_MS = 160;
const UNDO_MS = 5000;
const NONE = "__none__";

const BUTTON_STYLE: Record<TriageAction, string> = {
  today: "bg-surface-2 text-fg",
  tomorrow: "bg-surface-2 text-fg",
  week: "bg-surface-2 text-fg",
  someday: "bg-surface-2 text-fg",
  done: "bg-success text-white",
  drop: "border-[1.5px] border-danger bg-transparent text-danger",
};

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface MobileInboxProps {
  tasks: TaskWithRelations[];
  areas: Area[];
  projects: Project[];
  todayIso: string;
  timeZone: string;
}

export function MobileInbox({ tasks, areas, projects, todayIso, timeZone }: MobileInboxProps) {
  const [triaged, markTriaged] = useOptimistic<readonly string[], string>(
    NOTHING_TRIAGED,
    (state, id) => (state.includes(id) ? state : [...state, id]),
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);
  const [total, setTotal] = useState(tasks.length);

  const visible = tasks.filter((task) => !triaged.includes(task.id));
  if (visible.length > total) setTotal(visible.length);
  const top = visible[0];

  const decide = useCallback(
    (action: TriageAction, task: TaskWithRelations) => {
      startTransition(async () => {
        markTriaged(task.id);
        setError(null);
        setUndo(null);
        try {
          const result = await runTriage(action, task.id, todayIso);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          // Vrátiť sa dá len zahodenie — ostatné rozhodnutia sa dajú
          // opraviť na obrazovkách, kam úloha presiahla.
          if (action === "drop") setUndo({ id: task.id, title: task.title });
        } catch {
          setError("Zmenu sa nepodarilo uložiť. Skús to znova.");
        }
      });
    },
    [markTriaged, todayIso],
  );

  const undoDrop = useCallback((id: string) => {
    setUndo(null);
    startTransition(async () => {
      try {
        const result = await restoreTask(id);
        if (!result.ok) setError(result.error);
      } catch {
        setError("Úlohu sa nepodarilo vrátiť. Skús to znova.");
      }
    });
  }, []);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const position = total - visible.length + 1;

  return (
    <div className="pb-6">
      <header className="flex h-[52px] items-center justify-between px-5">
        <div className="flex items-baseline gap-2">
          <h1 className="text-row font-semibold">Inbox</h1>
          <span aria-live="polite" className="text-body text-fg-subtle">
            {countSk(visible.length, "vec", "veci", "vecí")}
          </span>
        </div>
        {top ? (
          <span className="text-body text-fg-subtle">
            {position} z {total}
          </span>
        ) : null}
      </header>

      {top ? (
        <>
          <div className="relative mx-5 mt-4 h-[266px]">
            {visible[2] ? (
              <div
                aria-hidden="true"
                className="absolute inset-x-6 top-4 h-[250px] rounded-[22px] bg-border"
              />
            ) : null}
            {visible[1] ? (
              <div
                aria-hidden="true"
                className="absolute inset-x-3 top-2 h-[250px] rounded-[22px] bg-surface-2"
              />
            ) : null}
            <InboxCard
              key={top.id}
              task={top}
              todayIso={todayIso}
              timeZone={timeZone}
              onDecide={(action) => decide(action, top)}
            />
          </div>

          <p className="mx-5 mt-6 text-body text-fg-muted">Kam to patrí</p>
          <div className="mx-5 mt-3 grid grid-cols-3 gap-2.5">
            {TRIAGE_ORDER.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => decide(action, top)}
                aria-label={TRIAGE_ACTIONS[action].hint}
                className={cn(
                  "h-12 whitespace-nowrap rounded-[14px] p-0 text-row font-semibold",
                  BUTTON_STYLE[action],
                )}
              >
                {TRIAGE_ACTIONS[action].label}
              </button>
            ))}
          </div>

          <p className="mx-5 mt-7 text-body text-fg-muted">Rýchle doplnenie</p>
          <QuickFill key={top.id} task={top} areas={areas} projects={projects} onError={setError} />

          <p className="mt-5 text-center text-meta text-fg-subtle">
            Potiahni doprava = Dnes, doľava = Niekedy
          </p>
        </>
      ) : (
        <EmptyState />
      )}

      {error ? (
        <p role="status" className="mx-5 mt-3 text-meta font-medium text-danger">
          {error}
        </p>
      ) : null}

      <div role="status" aria-live="polite">
        {undo ? (
          <div className="mx-5 mt-3 flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-4 py-2 text-body text-fg-muted">
            <span className="min-w-0 truncate">Zahodené: {undo.title}</span>
            <button
              type="button"
              onClick={() => undoDrop(undo.id)}
              aria-label={`Vrátiť späť zahodenú úlohu ${undo.title}`}
              className="flex h-11 shrink-0 items-center gap-1.5 px-2 font-semibold text-fg"
            >
              <Undo2 aria-hidden="true" className="size-4" />
              Späť
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState() {
  const { openCapture } = useCapture();
  return (
    <div className="mx-5 mt-4 flex h-[266px] flex-col justify-between rounded-[22px] bg-surface-2 p-5">
      <div>
        <h2 className="font-display text-hero leading-[1.05] tracking-tight">Inbox na nule</h2>
        <p className="mt-2 text-body text-fg-muted">
          Všetko zachytené má svoje miesto. Nič tu na teba nečaká.
        </p>
      </div>
      <button
        type="button"
        onClick={() => openCapture()}
        className="flex h-[52px] items-center justify-center rounded-[14px] bg-accent text-row font-semibold text-accent-fg"
      >
        Zachytiť
      </button>
    </div>
  );
}

function InboxCard({
  task,
  todayIso,
  timeZone,
  onDecide,
}: {
  task: TaskWithRelations;
  todayIso: string;
  timeZone: string;
  onDecide: (action: TriageAction) => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exit, setExit] = useState<"left" | "right" | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function commit(target: "today" | "someday") {
    if (exit !== null) return;
    if (prefersReducedMotion()) {
      onDecide(target);
      return;
    }
    setExit(target === "today" ? "right" : "left");
    timer.current = window.setTimeout(() => onDecide(target), EXIT_MS);
  }

  function onPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (exit !== null) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    const s = start.current;
    if (!s || s.id !== event.pointerId) return;
    const moveX = event.clientX - s.x;
    const moveY = event.clientY - s.y;
    if (!dragging) {
      // Zvislé ťahanie je rolovanie stránky, nie gesto.
      if (Math.abs(moveY) > Math.abs(moveX) && Math.abs(moveY) > 8) {
        start.current = null;
        return;
      }
      if (Math.abs(moveX) < 6) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    setDx(moveX);
  }

  function finish(event: React.PointerEvent<HTMLElement>, cancelled: boolean) {
    const s = start.current;
    if (!s || s.id !== event.pointerId) return;
    start.current = null;
    setDragging(false);
    const target = cancelled ? null : swipeTarget(dx);
    if (target) commit(target);
    else setDx(0);
  }

  const offset = exit === "left" ? -140 : exit === "right" ? 140 : null;
  const transform =
    offset !== null
      ? `translateX(${offset}%) rotate(${offset / 14}deg)`
      : dx !== 0
        ? `translateX(${dx}px) rotate(${dx / 24}deg)`
        : undefined;
  const leaning = swipeTarget(dx);

  return (
    <article
      aria-label={task.title}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
      style={{ transform, touchAction: "pan-y" }}
      className={cn(
        "absolute inset-x-0 top-0 z-10 h-[250px] select-none overflow-hidden rounded-[22px] border border-border bg-surface p-4",
        !dragging &&
          "transition-[transform,opacity] duration-150 ease-out motion-reduce:transition-none",
        offset !== null && "opacity-0",
      )}
    >
      <div className="flex h-[18px] items-center justify-between text-body text-fg-subtle">
        <span>{addedLabel(new Date(task.createdAt), todayIso, timeZone)}</span>
        {leaning ? (
          <span className="font-semibold text-fg">
            {leaning === "today" ? "Dnes" : "Niekedy"}
          </span>
        ) : null}
      </div>
      <h2
        className="mt-3 line-clamp-3 font-display [overflow-wrap:anywhere] leading-[1.1] tracking-tight"
        style={{ fontSize: 22 }}
      >
        {task.title}
      </h2>
      {task.note ? (
        <p className="mt-3 line-clamp-4 text-body [overflow-wrap:anywhere] text-fg-muted">{task.note}</p>
      ) : null}
    </article>
  );
}

const CHIP =
  "flex h-9 w-auto max-w-full shrink-0 items-center gap-[7px] rounded-full border-0 bg-surface-2 px-3 text-body font-medium text-fg md:h-9";

function QuickFill({
  task,
  areas,
  projects,
  onError,
}: {
  task: TaskWithRelations;
  areas: Area[];
  projects: Project[];
  onError: (message: string) => void;
}) {
  const [, startTransition] = useTransition();
  const [areaId, setAreaId] = useState(task.areaId ?? NONE);
  const [projectId, setProjectId] = useState(task.projectId ?? NONE);

  const area = areas.find((a) => a.id === areaId);
  const project = projects.find((p) => p.id === projectId);

  function save(
    patch: { areaId?: string | null; projectId?: string | null },
    revert: () => void,
  ) {
    startTransition(async () => {
      try {
        const result = await updateTask(task.id, patch);
        if (!result.ok) {
          revert();
          onError(result.error);
        }
      } catch {
        revert();
        onError("Zmenu sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  return (
    <div className="mx-5 mt-3 flex gap-2">
      <Select
        value={areaId}
        onValueChange={(value) => {
          const before = areaId;
          setAreaId(value);
          save({ areaId: value === NONE ? null : value }, () => setAreaId(before));
        }}
      >
        <SelectTrigger aria-label="Oblasť úlohy" className={CHIP}>
          {area ? (
            <i
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: areaColorValue(area.color) }}
            />
          ) : null}
          <SelectValue>Oblasť: {area ? area.name : "bez oblasti"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Bez oblasti</SelectItem>
          {areas.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={projectId}
        onValueChange={(value) => {
          const before = projectId;
          setProjectId(value);
          save({ projectId: value === NONE ? null : value }, () => setProjectId(before));
        }}
      >
        <SelectTrigger aria-label="Projekt úlohy" className={CHIP}>
          <SelectValue>Projekt: {project ? project.name : "bez projektu"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Bez projektu</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
