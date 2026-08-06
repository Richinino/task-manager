"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { QuickCapture } from "@/components/capture/quick-capture";
import { CommandPalette, type CommandTask } from "@/components/command/command-palette";
import { NAV_ITEMS } from "@/components/shell/sidebar";
import { registerShortcuts, type Shortcut } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@/server/queries/tasks";

/**
 * Jedno miesto, kde žije rýchle zachytenie aj Ctrl+K paleta.
 *
 * Obaľuje obsah prihlásenej časti a drží:
 * - globálne skratky (`n` / `Ctrl+N` zachytenie, `Ctrl+K` paleta, `t w m i` navigácia),
 * - stav oboch okien — otvorené je vždy najviac jedno,
 * - zoznam úloh pre vyhľadávanie v palete (prichádza propom z layoutu,
 *   provider si nič nedotahuje sám).
 */

/**
 * Next 16 má zapnuté `typedRoutes` a od `router.push` čaká literál cesty.
 * `NAV_ITEMS` ich nesie ako obyčajný reťazec, preto jedno pretypovanie tu —
 * odvodené priamo od routera, aby prežilo aj zmenu jeho typov.
 */
type RouterHref = Parameters<ReturnType<typeof useRouter>["push"]>[0];

export interface CaptureContextValue {
  openCapture: () => void;
  closeCapture: () => void;
  openPalette: () => void;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

/** Rýchle zachytenie a paleta z ktoréhokoľvek klientského komponentu pod providerom. */
export function useCapture(): CaptureContextValue {
  const value = useContext(CaptureContext);
  if (value === null) {
    throw new Error("useCapture sa dá volať iba vnútri <CaptureProvider>.");
  }
  return value;
}

export interface CaptureProviderProps {
  /** Úlohy, v ktorých paleta hľadá podľa názvu. */
  tasks?: readonly TaskWithRelations[];
  /** Prvý deň týždňa z nastavení používateľa. */
  weekStartsOn?: number;
  children: ReactNode;
}

export function CaptureProvider({
  tasks,
  weekStartsOn = 1,
  children,
}: CaptureProviderProps) {
  const router = useRouter();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Dve okná naraz by si kradli fokus — otvorenie jedného zatvorí druhé.
  const openCapture = useCallback(() => {
    setPaletteOpen(false);
    setCaptureOpen(true);
  }, []);
  const closeCapture = useCallback(() => setCaptureOpen(false), []);
  const openPalette = useCallback(() => {
    setCaptureOpen(false);
    setPaletteOpen(true);
  }, []);

  const contextValue = useMemo<CaptureContextValue>(
    () => ({ openCapture, closeCapture, openPalette }),
    [openCapture, closeCapture, openPalette],
  );

  /* ── globálne skratky ─────────────────────────────────────────────────── */

  const busy = captureOpen || paletteOpen;

  useEffect(() => {
    const shortcuts: Shortcut[] = [
      { keys: ["n", "mod+n"], run: openCapture },
      { keys: "mod+k", run: openPalette },
    ];

    // Navigačné skratky mlčia, kým je otvorené okno — inak by sa stránka
    // prekliknutím vymenila používateľovi pod rukami.
    if (!busy) {
      for (const item of NAV_ITEMS) {
        shortcuts.push({
          keys: item.shortcut,
          run: () => router.push(item.href as RouterHref),
        });
      }
    }

    return registerShortcuts(shortcuts);
  }, [busy, openCapture, openPalette, router]);

  /* ── úlohy pre paletu ─────────────────────────────────────────────────── */

  const commandTasks = useMemo<CommandTask[]>(() => {
    if (tasks === undefined) return [];
    // Zoznamy sa môžu prekrývať (inbox × naplánované) — id je poistka proti duplicitám.
    const seen = new Set<string>();
    const out: CommandTask[] = [];
    for (const task of tasks) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      out.push({
        id: task.id,
        title: task.title,
        plannedDate: task.plannedDate,
        inbox: task.status === "inbox",
        done: task.status === "done" || task.status === "dropped",
        projectName: task.project?.name ?? null,
      });
    }
    return out;
  }, [tasks]);

  return (
    <CaptureContext.Provider value={contextValue}>
      {children}

      {/* Na telefóne nie je klávesnica so skratkami — zachytenie musí byť
          dosiahnuteľné palcom. Nad spodnou lištou, mimo jej dosahu. */}
      <button
        type="button"
        onClick={openCapture}
        aria-label="Rýchle zachytenie úlohy"
        style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom) + 0.75rem)" }}
        className={cn(
          "fixed right-4 z-40 inline-flex size-12 items-center justify-center rounded-full",
          "bg-accent text-accent-fg shadow-md transition-colors duration-100 active:bg-accent/80",
          "md:hidden",
        )}
      >
        <Plus aria-hidden="true" className="size-5" />
      </button>

      <QuickCapture
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        weekStartsOn={weekStartsOn}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        tasks={commandTasks}
        onCreateTask={openCapture}
        weekStartsOn={weekStartsOn}
      />
    </CaptureContext.Provider>
  );
}
