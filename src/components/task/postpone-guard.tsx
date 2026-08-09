"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Scissors, Trash2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTaskDetail } from "@/components/task/task-detail-provider";
import { deleteTask, rescheduleTask } from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   BLOK PRI ODKLADOCH

   Server odmietne odklad, ktorý by dovŕšil `settings.postponeBlockAt`, kódom
   `postpone_blocked`. Tento komponent na to nasadí dialóg: jedno miesto pre
   celú appku, mountované v layoute, rovnako ako panel detailu.

   Dialóg je len pohodlie — rozhoduje server. Klient sa dá obísť zastaranou
   záložkou aj druhým zariadením, takže tu nie je žiadna vlastná kontrola prahu.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Rovnaký tvar, aký vracia `rescheduleTask`. */
export type PostponeResult =
  | { ok: true; data: { postponeCount: number } }
  | { ok: false; error: string };

export interface PostponeInput {
  taskId: string;
  title: string;
  /** Cieľový deň, alebo `null` pre zrušenie dátumu. */
  plannedDate: string | null;
  /**
   * Celá úloha, ak ju volajúci má. Bez nej sa v dialógu neponúkne otvorenie
   * detailu — rozdeliť ani zmenšiť sa totiž nedá naslepo.
   */
  task?: TaskWithRelations;
}

export interface PostponeGuardValue {
  /**
   * Odloží úlohu. Keď server odklad zastaví, otvorí sa dialóg a prísľub sa
   * vyrieši až po rozhodnutí — volajúci teda nemusí o bloku vedieť vôbec.
   */
  postpone: (input: PostponeInput) => Promise<PostponeResult>;
}

const PostponeGuardContext = createContext<PostponeGuardValue | null>(null);

/**
 * Vráti `null` mimo providera. Rovnako ako pri detaile: komponenty úloh sa
 * používajú aj tam, kde provider nie je, a spadnúť kvôli tomu by bolo
 * neúmerné — bez neho sa blok prejaví len hláškou.
 */
export function usePostponeGuard(): PostponeGuardValue | null {
  return useContext(PostponeGuardContext);
}

/** Čo dialóg rieši, kým je otvorený. */
interface PendingBlock {
  input: PostponeInput;
  postponeCount: number;
  resolve: (result: PostponeResult) => void;
}

export function PostponeGuardProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingBlock | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const detail = useTaskDetail();

  /** Aby sa jeden blok nevyriešil dvakrát (dialóg zavrieť aj kliknúť). */
  const settledRef = useRef(false);

  const settle = useCallback((result: PostponeResult) => {
    setPending((current) => {
      if (current && !settledRef.current) {
        settledRef.current = true;
        current.resolve(result);
      }
      return null;
    });
    setReason("");
    setError(null);
  }, []);

  const postpone = useCallback(
    async (input: PostponeInput): Promise<PostponeResult> => {
      const result = await rescheduleTask(input.taskId, input.plannedDate);

      if (result.ok || result.code !== "postpone_blocked") return result;

      // Zastavené — ďalej rozhoduje človek. Prísľub visí, kým sa nerozhodne.
      return new Promise<PostponeResult>((resolve) => {
        settledRef.current = false;
        setReason("");
        setError(null);
        setPending({
          input,
          postponeCount: result.detail?.postponeCount ?? 0,
          resolve,
        });
      });
    },
    [],
  );

  const value = useMemo<PostponeGuardValue>(() => ({ postpone }), [postpone]);

  /* ── rozhodnutia ─────────────────────────────────────────────────────────── */

  function confirmWithReason(): void {
    if (!pending) return;
    const text = reason.trim();
    if (text === "") {
      setError("Napíš, prečo to odkladáš.");
      return;
    }

    startTransition(async () => {
      const result = await rescheduleTask(
        pending.input.taskId,
        pending.input.plannedDate,
        { reason: text },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      settle(result);
    });
  }

  function dropTask(): void {
    if (!pending) return;
    startTransition(async () => {
      const result = await deleteTask(pending.input.taskId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Úloha je preč, takže sa neodložila — volajúci má vrátiť svoj
      // optimistický stav a zoznam sa prekreslí z revalidácie.
      settle({ ok: false, error: "" });
    });
  }

  function openDetail(): void {
    if (!pending?.input.task) return;
    const task = pending.input.task;
    settle({ ok: false, error: "" });
    detail?.open(task);
  }

  const open = pending !== null;
  const count = pending?.postponeCount ?? 0;

  return (
    <PostponeGuardContext.Provider value={value}>
      {children}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Zavretie bez výberu = úloha sa NEODLOŽÍ. To je celý zmysel bloku.
          if (!next && !isPending) settle({ ok: false, error: "" });
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-start gap-2">
              <TriangleAlert
                aria-hidden="true"
                size={18}
                className="mt-0.5 shrink-0 text-warn"
              />
              <span className="min-w-0">
                Túto úlohu si už odložil {count}×
              </span>
            </DialogTitle>
            <DialogDescription>
              {pending ? `„${pending.input.title}“ ` : ""}
              sa nehýbe. Odkladať ju ďalej bez rozhodnutia je to isté ako
              nemať ju vôbec — vyber si, čo s ňou.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {pending?.input.task ? (
              <button
                type="button"
                onClick={openDetail}
                disabled={isPending}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded border border-border bg-surface",
                  "px-3 py-2.5 text-left transition-colors duration-100 ease-out",
                  "hover:border-border-strong hover:bg-surface-2",
                  "disabled:pointer-events-none disabled:opacity-45",
                )}
              >
                <Scissors aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-fg-muted" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">
                    Rozdeliť alebo zmenšiť
                  </span>
                  <span className="block text-[13px] leading-relaxed text-fg-muted">
                    Otvorí úlohu. Úloha, ktorá sa štyri razy neurobila, je
                    obyčajne priveľká — rozpadni ju na kroky alebo zmenši, čo
                    od nej čakáš.
                  </span>
                </span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={dropTask}
              disabled={isPending}
              className={cn(
                "flex w-full items-start gap-2.5 rounded border border-border bg-surface",
                "px-3 py-2.5 text-left transition-colors duration-100 ease-out",
                "hover:border-danger hover:bg-surface-2",
                "disabled:pointer-events-none disabled:opacity-45",
              )}
            >
              <Trash2 aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-fg-muted" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">Zahodiť</span>
                <span className="block text-[13px] leading-relaxed text-fg-muted">
                  Keď sa štyrikrát neurobila, možno ju netreba. Zahodenie sa dá
                  vrátiť.
                </span>
              </span>
            </button>

            <div className="flex flex-col gap-1.5 rounded border border-border bg-surface px-3 py-2.5">
              <label
                htmlFor="postpone-reason"
                className="text-sm font-medium text-fg"
              >
                Alebo odlož — ale povedz prečo
              </label>
              <p className="text-[13px] leading-relaxed text-fg-muted">
                Dôvod sa uloží k úlohe. Pri mesačnej revízii uvidíš, čo ťa
                naozaj brzdí.
              </p>
              <Input
                id="postpone-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirmWithReason();
                  }
                }}
                placeholder="Napr. čakám na podklady od Petra"
                maxLength={500}
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
            </div>

            <div aria-live="polite" className="min-h-5">
              {error ? (
                <p className="text-[13px] leading-relaxed text-danger">{error}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => settle({ ok: false, error: "" })}
            >
              Nechať tak
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={isPending || reason.trim() === ""}
              onClick={confirmWithReason}
            >
              Odložiť s dôvodom
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PostponeGuardContext.Provider>
  );
}
