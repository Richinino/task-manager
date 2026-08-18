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
 *   provider si nič nedotahuje sám),
 * - predvyplnenia jedného otvorenia: `openCapture({ defaultDate, defaultText })`
 *   otvorí to isté okno, len už s dňom (a prípadne s rozpísaným textom).
 *   Volanie bez argumentu je pôvodné správanie — `n` aj Ctrl+K ostávajú, aké boli.
 */

/**
 * Next 16 má zapnuté `typedRoutes` a od `router.push` čaká literál cesty.
 * `NAV_ITEMS` ich nesie ako obyčajný reťazec, preto jedno pretypovanie tu —
 * odvodené priamo od routera, aby prežilo aj zmenu jeho typov.
 */
type RouterHref = Parameters<ReturnType<typeof useRouter>["push"]>[0];

/** Čím sa dá rýchle zachytenie predvyplniť pri otvorení. */
export interface OpenCaptureOptions {
  /**
   * Deň, na ktorý sa úloha predvolene naplánuje — RRRR-MM-DD.
   * Deň napísaný v texte má prednosť; rieši to serverová akcia.
   */
  defaultDate?: string;
  /** Text, ktorý už používateľ napísal inde (napríklad do poľa v dni). */
  defaultText?: string;
}

export interface CaptureContextValue {
  openCapture: (options?: OpenCaptureOptions) => void;
  closeCapture: () => void;
  openPalette: () => void;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Rýchle zachytenie a paleta z ktoréhokoľvek klientského komponentu pod providerom. */
export function useCapture(): CaptureContextValue {
  const value = useContext(CaptureContext);
  if (value === null) {
    throw new Error("useCapture sa dá volať iba vnútri <CaptureProvider>.");
  }
  return value;
}

/**
 * To isté, ale bez výbuchu mimo providera — vráti `null`.
 *
 * Pre komponenty, ktoré rýchle zachytenie iba ponúkajú ako doplnok
 * (tlačidlo „viac" pri poli v dni) a bez neho majú ostať funkčné.
 */
export function useCaptureOptional(): CaptureContextValue | null {
  return useContext(CaptureContext);
}

export interface CaptureProviderProps {
  /** Úlohy, v ktorých paleta hľadá podľa názvu. */
  tasks?: readonly TaskWithRelations[];
  /** Prvý deň týždňa z nastavení používateľa. */
  weekStartsOn?: number;
  /**
   * Názvy existujúcich projektov. Náhľad podľa nich pozná, či `+projekt`
   * na niečo naozaj ukazuje — server nový projekt zámerne nezakladá.
   */
  projectNames?: readonly string[];
  children: ReactNode;
}

export function CaptureProvider({
  tasks,
  weekStartsOn = 1,
  projectNames,
  children,
}: CaptureProviderProps) {
  const router = useRouter();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Predvyplnenia platia vždy len pre jedno otvorenie — pri zatvorení sa mažú. */
  const [captureDate, setCaptureDate] = useState<string | null>(null);
  const [captureText, setCaptureText] = useState<string | null>(null);

  // Dve okná naraz by si kradli fokus — otvorenie jedného zatvorí druhé.
  const openCapture = useCallback((options?: OpenCaptureOptions) => {
    /*
      `openCapture` sa vo viacerých miestach vešia priamo na obsluhu udalosti,
      takže sem môže omylom priletieť aj `MouseEvent`. Preto sa hodnoty
      neberú tak, ako prišli, ale až po overení tvaru — z pokazeného vstupu
      vznikne „bez predvyplnenia", nie rozbitý dialóg.
    */
    const date = options?.defaultDate;
    const text = options?.defaultText;
    setCaptureDate(typeof date === "string" && ISO_DATE_RE.test(date) ? date : null);
    setCaptureText(typeof text === "string" && text.trim() !== "" ? text : null);

    setPaletteOpen(false);
    setCaptureOpen(true);
  }, []);
  const closeCapture = useCallback(() => setCaptureOpen(false), []);
  const openPalette = useCallback(() => {
    setCaptureOpen(false);
    setPaletteOpen(true);
  }, []);

  /** Zatvorenie okna zároveň zahodí predvyplnenia — ďalšie `n` má byť čisté. */
  const handleCaptureOpenChange = useCallback((next: boolean) => {
    setCaptureOpen(next);
    if (!next) {
      setCaptureDate(null);
      setCaptureText(null);
    }
  }, []);

  const contextValue = useMemo<CaptureContextValue>(
    () => ({ openCapture, closeCapture, openPalette }),
    [openCapture, closeCapture, openPalette],
  );

  /* ── globálne skratky ─────────────────────────────────────────────────── */

  const busy = captureOpen || paletteOpen;

  useEffect(() => {
    const shortcuts: Shortcut[] = [
      // Zabalené zámerne: `run` dostáva `KeyboardEvent` a ten by sa inak
      // odovzdal ako voľby otvorenia.
      { keys: ["n", "mod+n"], run: () => openCapture() },
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
        onClick={() => openCapture()}
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
        onOpenChange={handleCaptureOpenChange}
        weekStartsOn={weekStartsOn}
        {...(projectNames ? { projectNames } : {})}
        defaultDate={captureDate ?? undefined}
        defaultText={captureText ?? undefined}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        tasks={commandTasks}
        onCreateTask={() => openCapture()}
        weekStartsOn={weekStartsOn}
      />
    </CaptureContext.Provider>
  );
}
