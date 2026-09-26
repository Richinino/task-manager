"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Undo2 } from "lucide-react";

import { AgendaDetail, type AgendaSubjectOption } from "@/components/agenda/agenda-detail";
import { useCaptureOptional } from "@/components/capture/capture-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadAgendaItem, restoreAgendaItem } from "@/server/actions/agenda";
import type { AgendaItemRow } from "@/server/queries/agenda";

/* ═══════════════════════════════════════════════════════════════════════════
   KONTEXT DETAILU UDALOSTI

   Rovnaký vzor ako detail úlohy: panel žije v layoute prihlásenej časti
   a otvára ho ktorýkoľvek riadok udalosti — v Dnes, Týždni, Mesiaci,
   Rozvrhu aj na obrazovke Udalostí. Otvára sa celým riadkom (volajúci ho
   má), alebo len id (po založení z rýchleho zachytenia).
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AgendaOpenOptions {
  /** Hneď ukázať návrh prípravy — po zachytení písomky. */
  offer?: boolean;
}

export interface AgendaDetailContextValue {
  open: (item: AgendaItemRow, options?: AgendaOpenOptions) => void;
  openById: (id: string, options?: AgendaOpenOptions) => void;
}

const AgendaDetailContext = createContext<AgendaDetailContextValue | null>(null);

/** `null` mimo providera — riadok potom jednoducho neponúkne otvorenie. */
export function useAgendaDetail(): AgendaDetailContextValue | null {
  return useContext(AgendaDetailContext);
}

const FLASH_MS = 10_000;

export function AgendaDetailProvider({
  subjects,
  todayIso,
  children,
}: {
  subjects: readonly AgendaSubjectOption[];
  todayIso: string;
  children: ReactNode;
}) {
  const [item, setItem] = useState<AgendaItemRow | null>(null);
  const [autoOffer, setAutoOffer] = useState(false);
  const [seq, setSeq] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [flash, setFlash] = useState<AgendaItemRow | null>(null);
  /* Vrátenie zlyhalo — hláška ostane, aby človek vedel, že udalosť je stále preč. */
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const openerRef = useRef<HTMLElement | null>(null);

  const open = useCallback((next: AgendaItemRow, options?: AgendaOpenOptions) => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    setFlash(null);
    setRestoreError(null);
    setAutoOffer(options?.offer === true);
    setItem(next);
    setSeq((n) => n + 1);
    setIsOpen(true);
  }, []);

  const openById = useCallback(
    (id: string, options?: AgendaOpenOptions) => {
      startTransition(async () => {
        const result = await loadAgendaItem(id);
        if (result.ok) open(result.data, options);
      });
    },
    [open],
  );

  /* Zachytenie po uložení písomky otvorí detail s návrhom prípravy. */
  const capture = useCaptureOptional();
  useEffect(() => {
    if (capture === null) return;
    return capture.registerAgendaOpener((id) => openById(id, { offer: true }));
  }, [capture, openById]);

  const value = useMemo(() => ({ open, openById }), [open, openById]);

  const restoreFocus = useCallback(() => {
    const opener = openerRef.current;
    if (opener !== null && opener.isConnected) opener.focus();
  }, []);

  useEffect(() => {
    if (flash === null) return;
    const timer = window.setTimeout(() => {
      setFlash(null);
      setRestoreError(null);
    }, FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  return (
    <AgendaDetailContext.Provider value={value}>
      {children}

      {item !== null ? (
        <AgendaDetail
          key={`${item.id}:${seq}`}
          item={item}
          open={isOpen}
          onOpenChange={setIsOpen}
          onDeleted={(deleted) => {
            setIsOpen(false);
            setRestoreError(null);
            setFlash(deleted);
          }}
          onRestoreFocus={restoreFocus}
          autoOffer={autoOffer}
          subjects={subjects}
          todayIso={todayIso}
        />
      ) : null}

      <div
        role="status"
        aria-live="polite"
        style={{ bottom: "calc(var(--bar-inset) + 0.75rem)" }}
        className="pointer-events-none fixed left-4 right-20 z-40 md:left-auto md:right-4 md:w-96"
      >
        {flash !== null ? (
          <div
            className={cn(
              "pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded",
              "border border-border bg-surface px-3 py-2 text-body text-fg-muted shadow-md",
            )}
          >
            {restoreError !== null ? (
              <span className="min-w-0 text-danger">
                „{flash.title}“ sa nepodarilo vrátiť: {restoreError}
              </span>
            ) : (
              <span className="min-w-0 truncate">„{flash.title}“ je zmazaná.</span>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const deleted = flash;
                setFlash(null);
                setRestoreError(null);
                startTransition(async () => {
                  const result = await restoreAgendaItem(deleted.id);
                  if (!result.ok) {
                    setRestoreError(result.error);
                    setFlash(deleted);
                  }
                });
              }}
            >
              <Undo2 size={14} aria-hidden="true" />
              Vrátiť späť
            </Button>
          </div>
        ) : null}
      </div>
    </AgendaDetailContext.Provider>
  );
}
