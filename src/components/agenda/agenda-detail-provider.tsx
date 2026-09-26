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

export interface AgendaDetailContextValue {
  open: (item: AgendaItemRow) => void;
  openById: (id: string) => void;
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
  const [seq, setSeq] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [flash, setFlash] = useState<AgendaItemRow | null>(null);
  const [, startTransition] = useTransition();
  const openerRef = useRef<HTMLElement | null>(null);

  const open = useCallback((next: AgendaItemRow) => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    setFlash(null);
    setItem(next);
    setSeq((n) => n + 1);
    setIsOpen(true);
  }, []);

  const openById = useCallback(
    (id: string) => {
      startTransition(async () => {
        const result = await loadAgendaItem(id);
        if (result.ok) open(result.data);
      });
    },
    [open],
  );

  const value = useMemo(() => ({ open, openById }), [open, openById]);

  const restoreFocus = useCallback(() => {
    const opener = openerRef.current;
    if (opener !== null && opener.isConnected) opener.focus();
  }, []);

  useEffect(() => {
    if (flash === null) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
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
            setFlash(deleted);
          }}
          onRestoreFocus={restoreFocus}
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
            <span className="min-w-0 truncate">„{flash.title}“ je zmazaná.</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                const id = flash.id;
                setFlash(null);
                startTransition(async () => {
                  await restoreAgendaItem(id);
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
