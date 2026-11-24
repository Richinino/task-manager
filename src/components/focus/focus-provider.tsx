"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { useOutbox } from "@/components/pwa/outbox-provider";
import { EXTEND_FOCUS_MIN, isFocusOver } from "@/lib/focus";
import {
  focusProgress,
  liveSpentMinutes,
  nextTickAt,
  remainingFromIso,
  shouldNotifyLocally,
  timeUpNotification,
} from "@/lib/focus-label";
import {
  extendFocus,
  finishFocus,
  markFocusNotified,
  pauseFocus,
  startFocus,
  stuckFocus,
} from "@/server/actions/focus";
import type { ActiveFocus } from "@/server/queries/focus";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { FocusContextProvider, type FocusContextValue } from "./focus-context";

/* ═══════════════════════════════════════════════════════════════════════════
   FOKUS — PROVIDER

   Pravda o tom, čo beží, je na serveri (`getActiveFocus` v layoute). Klient si
   ju len preberie a medzi dvoma načítaniami ju optimisticky posúva, aby
   „Pauza" alebo „+15 min" nečakali na sieť. Keď príde nové načítanie z
   layoutu (po akcii, po revalidácii), vyhráva server.

   Hodiny tikajú najviac raz za minútu, v rytme `plannedEndAt` — vtedy sa
   „zostáva N min" zmení presne vo chvíli, keď sa N zmenilo. Sekundy sa
   neukazujú nikde (PLAN.md §6.7: fokus nemá byť stopky).
   ═══════════════════════════════════════════════════════════════════════════ */

const ERROR_MS = 6000;
const MS_PER_MIN = 60_000;
/** Malá rezerva za hranicu minúty, aby `ceil` už prepočítal na novú hodnotu. */
const TICK_SLACK_MS = 50;

export interface FocusProviderProps {
  /** Bežiaci fokus z `getActiveFocus`. */
  initial: ActiveFocus | null;
  children: ReactNode;
}

/** Bežiaci fokus spolu s časom, kedy ho klient dostal. */
interface Live {
  active: ActiveFocus | null;
  /** ms — od tohto okamihu sa k `spentMin` zo servera pripočítavajú minúty. */
  loadedAt: number;
}

export function FocusProvider({ initial, children }: FocusProviderProps) {
  const router = useRouter();
  const outbox = useOutbox();

  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState<Live>(() => ({ active: initial, loadedAt: Date.now() }));
  const [prevInitial, setPrevInitial] = useState(initial);
  const [screenOpen, setScreenOpen] = useState(false);
  const [stuckOpen, setStuckOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    Nové načítanie z layoutu prebije optimistický stav. Vzor „predchádzajúca
    hodnota v stave" namiesto efektu: žiadne medzikolo s nesprávnou hodnotou.
    `now` je tu zámerne namiesto `Date.now()` — render nesmie čítať hodiny a
    chyba je najviac minúta, ktorú ticker po prvom tiku vyrovná.
  */
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setLive({ active: initial, loadedAt: now });
  }

  const active = live.active;

  /* ── hodiny ─────────────────────────────────────────────────────────────── */

  const plannedEndMs = active ? Date.parse(active.plannedEndAt) : null;

  useEffect(() => {
    if (plannedEndMs === null) return;
    let timer: number | undefined;

    const tick = (): void => {
      const current = Date.now();
      setNow(current);
      timer = window.setTimeout(
        tick,
        Math.max(1000, nextTickAt(plannedEndMs, current) - current) + TICK_SLACK_MS,
      );
    };
    // Prvý tik hneď (cez časovač, nie synchrónne v efekte) — `now` sa po
    // novom fokuse alebo predĺžení hneď vyrovná so skutočnými hodinami.
    timer = window.setTimeout(tick, 0);

    // Karta na pozadí časovače brzdí; po návrate sa hodiny dorovnajú hneď.
    const onVisible = (): void => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [plannedEndMs]);

  const remaining = active ? remainingFromIso(active.plannedEndAt, now) : null;
  const isOver = active ? isFocusOver(new Date(active.plannedEndAt), new Date(now)) : false;
  const spentMin = active ? liveSpentMinutes(active.spentMin, live.loadedAt, now) : 0;
  const progress =
    active && plannedEndMs !== null
      ? focusProgress(Date.parse(active.startedAt), plannedEndMs, now)
      : 0;

  /* ── chyby a odpojenie ──────────────────────────────────────────────────── */

  useEffect(() => {
    if (error === null) return;
    const timer = window.setTimeout(() => setError(null), ERROR_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  /** Fokus je serverový stav — bez pripojenia ho zmeniť nejde, a nebudeme tvrdiť opak. */
  const requireOnline = useCallback((): boolean => {
    const online = outbox?.online ?? (typeof navigator === "undefined" ? true : navigator.onLine);
    if (online) return true;
    setError("Bez pripojenia sa fokus nedá zmeniť. Skús to znova po pripojení.");
    return false;
  }, [outbox]);

  /* ── akcie ──────────────────────────────────────────────────────────────── */

  const start = useCallback(
    async (task: TaskWithRelations, options?: { openScreen?: boolean }): Promise<boolean> => {
      const wantScreen = options?.openScreen ?? true;
      if (live.active?.taskId === task.id) {
        if (wantScreen) setScreenOpen(true);
        return true;
      }
      if (!requireOnline()) return false;

      setBusy(true);
      setError(null);
      try {
        const result = await startFocus(task.id);
        if (!result.ok) {
          setError(result.error);
          return false;
        }
        const startedAt = new Date().toISOString();
        setLive({
          active: {
            sessionId: result.data.sessionId,
            taskId: task.id,
            startedAt,
            plannedEndAt: result.data.plannedEndAt,
            spentMin: result.data.spentMin,
            task,
          },
          loadedAt: Date.now(),
        });
        setNow(Date.now());
        if (wantScreen) setScreenOpen(true);
        return true;
      } catch {
        setError("Fokus sa nepodarilo začať. Skús to znova.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [live.active?.taskId, requireOnline],
  );

  /**
   * Spoločný postup pre akcie, ktoré fokus ukončia: najprv sa obrazovka
   * prekreslí bez neho, a keď server odmietne, vráti sa späť aj s hláškou.
   */
  const endWith = useCallback(
    async (
      run: () => Promise<{ ok: true } | { ok: false; error: string }>,
      fallback: string,
    ): Promise<void> => {
      if (!requireOnline()) return;
      const before = live;
      setLive({ active: null, loadedAt: Date.now() });
      setScreenOpen(false);
      setBusy(true);
      setError(null);
      try {
        const result = await run();
        if (!result.ok) {
          setLive(before);
          setError(result.error);
        }
      } catch {
        setLive(before);
        setError(fallback);
      } finally {
        setBusy(false);
        router.refresh();
      }
    },
    [live, requireOnline, router],
  );

  const pause = useCallback(
    () => endWith(() => pauseFocus(), "Fokus sa nepodarilo pozastaviť."),
    [endWith],
  );
  const finish = useCallback(
    (complete: boolean) => endWith(() => finishFocus({ complete }), "Fokus sa nepodarilo ukončiť."),
    [endWith],
  );
  const stuck = useCallback(
    () => endWith(() => stuckFocus(), "Fokus sa nepodarilo ukončiť."),
    [endWith],
  );

  const extend = useCallback(async (): Promise<void> => {
    const before = live;
    if (before.active === null || !requireOnline()) return;

    // Rovnaké pravidlo ako na serveri: od neskoršieho z „teraz" a konca.
    const base = Math.max(Date.now(), Date.parse(before.active.plannedEndAt));
    const plannedEndAt = new Date(base + EXTEND_FOCUS_MIN * MS_PER_MIN).toISOString();
    setLive({ ...before, active: { ...before.active, plannedEndAt } });
    setError(null);
    try {
      const result = await extendFocus(EXTEND_FOCUS_MIN);
      if (!result.ok) {
        setLive(before);
        setError(result.error);
        return;
      }
      // Serverová hodnota je záväzná — hodiny medzitým mohli ísť inak.
      setLive((current) =>
        current.active
          ? { ...current, active: { ...current.active, plannedEndAt: result.data.plannedEndAt } }
          : current,
      );
    } catch {
      setLive(before);
      setError("Fokus sa nepodarilo predĺžiť. Skús to znova.");
    }
  }, [live, requireOnline]);

  const openScreen = useCallback(() => setScreenOpen(true), []);
  const closeScreen = useCallback(() => setScreenOpen(false), []);
  const openStuck = useCallback(() => setStuckOpen(true), []);
  const openSplit = useCallback(() => setSplitOpen(true), []);
  const closeStuck = useCallback(() => setStuckOpen(false), []);
  const closeSplit = useCallback(() => setSplitOpen(false), []);

  /* ── „odhad vypršal" mimo okna ──────────────────────────────────────────── */

  const seenRunningRef = useRef<string | null>(null);
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (active === null) return;
    const key = active.plannedEndAt;

    if (!isOver) {
      seenRunningRef.current = key;
      return;
    }
    if (handledRef.current === key) return;
    // Rozhodnuté raz na `plannedEndAt` — či sa oznámilo, alebo bolo okno vidno.
    handledRef.current = key;
    // Appka sa otvorila až po vypršaní: nič sa „nestalo pred očami", takže
    // netreba ani oznámenie (ak ho chce, poslal ho server).
    if (seenRunningRef.current !== key) return;

    const permission = typeof Notification === "undefined" ? null : Notification.permission;
    if (
      !shouldNotifyLocally({
        permission,
        visibility: document.visibilityState,
        handledFor: null,
        plannedEndAt: key,
      })
    ) {
      return;
    }
    if (!("serviceWorker" in navigator)) return;

    const note = timeUpNotification(active.task.title, active.taskId);
    void navigator.serviceWorker.ready
      .then((registration) => registration.showNotification(note.title, note.options))
      // Až po ukázaní — keby zlyhalo, cron má ešte poslať svoje.
      .then(() => markFocusNotified())
      .catch(() => undefined);
  }, [active, isOver]);

  /* ── hodnota kontextu ───────────────────────────────────────────────────── */

  const value = useMemo<FocusContextValue>(
    () => ({
      active,
      nowMs: now,
      remaining,
      isOver,
      spentMin,
      progress,
      busy,
      screenOpen,
      isActiveTask: (taskId) => active?.taskId === taskId,
      start,
      pause,
      extend,
      finish,
      stuck,
      openScreen,
      closeScreen,
      openStuck,
      openSplit,
      stuckOpen,
      splitOpen,
      closeStuck,
      closeSplit,
      reportError: setError,
    }),
    [
      active,
      now,
      remaining,
      isOver,
      spentMin,
      progress,
      busy,
      screenOpen,
      start,
      pause,
      extend,
      finish,
      stuck,
      openScreen,
      closeScreen,
      openStuck,
      openSplit,
      stuckOpen,
      splitOpen,
      closeStuck,
      closeSplit,
    ],
  );

  return (
    <FocusContextProvider value={value}>
      {children}

      {/* Živá oblasť je v DOM stále — čítačka ohlási len zmenu existujúcej. */}
      <div
        role="status"
        aria-live="polite"
        style={{ bottom: "calc(var(--bar-inset) + 4rem)" }}
        className="pointer-events-none fixed left-4 right-4 z-[60] md:bottom-4! md:left-auto md:right-4 md:w-96"
      >
        {error !== null ? (
          <p className="pointer-events-auto rounded border border-danger bg-surface px-3 py-2 text-body text-danger shadow-md">
            {error}
          </p>
        ) : null}
      </div>
    </FocusContextProvider>
  );
}
