"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { CircleCheck, PackageOpen, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TaskEmpty } from "@/components/task/task-empty";
import { restoreTask } from "@/server/actions/tasks";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { DeferredHeader, type DeferredKind } from "./deferred-header";
import { DeferredRow, runDeferred, type DeferredAction } from "./deferred-row";

/* ═══════════════════════════════════════════════════════════════════════════
   ČO KTORÉ ODKLADISKO PONÚKA
   ═══════════════════════════════════════════════════════════════════════════ */

interface KindConfig {
  /** Rozhodnutia v riadku, v poradí zľava doprava. */
  actions: readonly DeferredAction[];
  empty: {
    icon: ReactNode;
    title: string;
    description: string;
    href: Route;
    hrefLabel: string;
  };
}

const CONFIG: Record<DeferredKind, KindConfig> = {
  someday: {
    // „Niekedy" bez cesty späť je len tichý cintorín. Dva najbližšie dni
    // pokrývajú drvivú väčšinu návratov; vzdialenejší dátum vyberie detail
    // úlohy alebo menu v riadku.
    actions: ["today", "tomorrow", "drop"],
    empty: {
      icon: <PackageOpen size={26} strokeWidth={1.75} />,
      title: "Zásobáreň je prázdna",
      description:
        "Nemáš tu nič odložené. Keď niečo v inboxe nevieš zaradiť, odlož to sem — nájdeš to presne tu, nie v inboxe navždy.",
      href: "/inbox",
      hrefLabel: "Prejsť na Inbox",
    },
  },
  waiting: {
    actions: ["unwait"],
    empty: {
      icon: <CircleCheck size={26} strokeWidth={1.75} />,
      title: "Nič nevisí na nikom inom",
      description:
        "Nič nevisí na niekom inom. Keď úlohu odovzdáš a čakáš na odpoveď, presuň ju sem — nezmizne a nebude ti strašiť v dnešku.",
      href: "/dnes",
      hrefLabel: "Prejsť na Dnes",
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   HLÁŠKY
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Tiché potvrdenie posledného rozhodnutia.
 *
 * Pri zahodení nesie aj `undoTaskId` — je to jediná akcia, ktorú sa inak nedá
 * vrátiť. Potvrdzovací dialóg by prácu brzdil, preto sa maže hneď a vrátiť sa
 * dá z tejto hlášky.
 */
interface Flash {
  message: string;
  undoTaskId?: string;
  /** Názov úlohy do menovky tlačidla — čítačke pri tabovaní nestačí okolitý text. */
  undoTitle?: string;
}

/** Ako dlho hláška visí — pri ponuke vrátenia musí byť čas si to rozmyslieť. */
const FLASH_MS = { plain: 5000, undo: 10_000 } as const;

/* ═══════════════════════════════════════════════════════════════════════════
   ZOZNAM
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DeferredListProps {
  kind: DeferredKind;
  /** Úlohy odkladiska, najstaršie hore. */
  tasks: TaskWithRelations[];
  /** Dnešok z pásma používateľa — aby sa server a klient nerozišli pri hydratácii. */
  todayIso: string;
  /** Od koľkých odkladov sa odznak zobrazí — `settings.postponeWarnAt`. */
  postponeWarnAt: number;
  /** Od koľkých odkladov je odznak červený — `settings.postponeBlockAt`. */
  postponeBlockAt: number;
}

/**
 * Spoločné telo obrazoviek „Niekedy" a „Čaká sa na".
 *
 * Obe robia to isté: ukážu, čo leží bokom, a pri každej veci ponúknu jedno
 * rozhodnutie, ktoré ju vráti do hry. Líšia sa len textami a zoznamom akcií —
 * dva takmer rovnaké zoznamy by sa časom rozišli, tak je tu jeden.
 */
export function DeferredList({
  kind,
  tasks,
  todayIso,
  postponeWarnAt,
  postponeBlockAt,
}: DeferredListProps) {
  const config = CONFIG[kind];
  const router = useRouter();

  /*
    Vybavená úloha zmizne hneď, ešte pred odpoveďou servera.

    Prečo obyčajný `useState` a nie `useOptimistic`: serverové akcie úloh
    revalidujú len /dnes, /tyzden, /mesiac a /inbox — tieto dve cesty medzi
    nimi nie sú a meniť serverovú vrstvu tu nesmieme. Optimistický stav by sa
    po dobehnutí prechodu vrátil k dátam, ktoré sa nemali odkiaľ obnoviť, a
    riadok by preblikol späť. Preto sa skrytie drží v bežnom stave a čerstvé
    dáta si vypýtame `router.refresh()` — ten obnoví celú aktuálnu cestu
    vrátane počtov v navigácii, na ktoré `revalidatePath` tiež nedosiahne.
  */
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  const undoTaskId = flash?.undoTaskId;
  const visible = tasks.filter((task) => !hidden.includes(task.id));

  const act = useCallback(
    (action: DeferredAction, taskId: string) => {
      const title = tasks.find((task) => task.id === taskId)?.title;
      const named = title ? `Úloha „${title}"` : "Úloha";

      setError(null);
      setFlash(null);
      setHidden((current) =>
        current.includes(taskId) ? current : [...current, taskId],
      );

      startTransition(async () => {
        try {
          const result = await runDeferred(action, taskId, todayIso);
          if (!result.ok) {
            // Riadok sa musí vrátiť — inak by úloha zmizla z obrazovky,
            // hoci na serveri ostala presne tam, kde bola.
            setHidden((current) => current.filter((id) => id !== taskId));
            setError(result.error);
            return;
          }

          if (action === "drop") {
            setFlash({
              message: `${named} je zahodená.`,
              undoTaskId: taskId,
              undoTitle: title,
            });
          } else if (action === "unwait") {
            setFlash({ message: `${named} je späť medzi aktívnymi.` });
          } else {
            setFlash({
              message:
                action === "today"
                  ? `${named} je naplánovaná na dnes.`
                  : `${named} je naplánovaná na zajtra.`,
            });
          }

          router.refresh();
        } catch {
          setHidden((current) => current.filter((id) => id !== taskId));
          setError("Zmenu sa nepodarilo uložiť. Skús to znova.");
        }
      });
    },
    [router, startTransition, tasks, todayIso],
  );

  /** Vráti späť posledné zahodenie. */
  const undoDrop = useCallback(
    (taskId: string) => {
      setFlash(null);
      startTransition(async () => {
        setError(null);
        try {
          const result = await restoreTask(taskId);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setHidden((current) => current.filter((id) => id !== taskId));
          router.refresh();
        } catch {
          setError("Úlohu sa nepodarilo vrátiť. Skús to znova.");
        }
      });
    },
    [router, startTransition],
  );

  /* Hláška o chybe sa nezatvára — sama zmizne. */
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  /* To isté pre potvrdenie; s ponukou vrátenia visí dlhšie. */
  useEffect(() => {
    if (!flash) return;
    const ms = flash.undoTaskId ? FLASH_MS.undo : FLASH_MS.plain;
    const timer = window.setTimeout(() => setFlash(null), ms);
    return () => window.clearTimeout(timer);
  }, [flash]);

  return (
    <div>
      <DeferredHeader kind={kind} count={visible.length} />

      {error ? (
        <p
          role="status"
          className={cn(
            "mb-3 rounded border border-danger bg-surface px-3 py-2",
            "text-body font-medium text-danger",
          )}
        >
          {error}
        </p>
      ) : null}

      {/* Oblasť je pripojená stále — čítačka ohlási len tú, ktorá už v DOM bola,
          keď sa jej obsah zmení. */}
      <div role="status" aria-live="polite">
        {flash ? (
          <div
            className={cn(
              "mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded border border-border",
              "bg-surface-2 px-3 py-2 text-body text-fg-muted",
            )}
          >
            <span className="min-w-0">{flash.message}</span>
            {undoTaskId ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => undoDrop(undoTaskId)}
                aria-label={
                  flash.undoTitle
                    ? `Vrátiť späť zahodenú úlohu ${flash.undoTitle}`
                    : "Vrátiť späť zahodenú úlohu"
                }
                // Na telefóne je to jediná záchrana — preto plných 44 px.
                className="h-11 shrink-0 px-3 sm:h-7 sm:px-2"
              >
                <Undo2 size={14} aria-hidden="true" />
                Vrátiť späť
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <TaskEmpty
          icon={config.empty.icon}
          title={config.empty.title}
          description={config.empty.description}
          action={
            <Link
              href={config.empty.href}
              className={cn(
                "inline-flex h-11 items-center justify-center rounded border border-border bg-surface px-4 sm:h-9 sm:px-3",
                "text-sm font-medium text-fg transition-colors duration-100 ease-out",
                "hover:border-border-strong hover:bg-surface-2",
              )}
            >
              {config.empty.hrefLabel}
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((task) => (
            <DeferredRow
              key={task.id}
              task={task}
              actions={config.actions}
              onAction={(action) => act(action, task.id)}
              todayIso={todayIso}
              postponeWarnAt={postponeWarnAt}
              postponeBlockAt={postponeBlockAt}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
