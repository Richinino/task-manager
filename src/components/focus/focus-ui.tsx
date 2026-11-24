"use client";

import { Suspense, useEffect } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SplitTaskDialog } from "@/components/task/split-task-dialog";
import { useTaskDetail } from "@/components/task/task-detail-provider";
import type { TaskWithRelations } from "@/server/queries/tasks";

import { useFocus } from "./focus-context";
import { FocusScreen } from "./focus-screen";
import { FocusStuckDialog } from "./focus-stuck-dialog";

/* ═══════════════════════════════════════════════════════════════════════════
   OKNÁ FOKUSU

   Obrazovka, dialóg „Zasekol som sa" a rozdelenie úlohy. Žijú zvlášť od
   `FocusProvider`, lebo potrebujú detail úlohy aj strážcu odkladov, ktoré
   sú v layoute POD providerom fokusu. Provider musí byť nad detailom — aj
   detail má mať tlačidlo „Začať fokus".
   ═══════════════════════════════════════════════════════════════════════════ */

export function FocusUi({ todayIso }: { todayIso: string }) {
  const focus = useFocus();
  const detail = useTaskDetail();

  const active = focus?.active ?? null;

  return (
    <>
      {/* Rezerva pod obsahom, aby lišta nad spodnou navigáciou nič nezakrývala. */}
      {active !== null && focus?.screenOpen !== true ? (
        <div aria-hidden="true" className="h-14 md:hidden" />
      ) : null}

      {focus !== null && active !== null ? (
        <>
          <FocusScreen
            open={focus.screenOpen && !focus.stuckOpen && !focus.splitOpen}
            onOpenDetail={
              detail
                ? (task: TaskWithRelations) => {
                    focus.closeScreen();
                    detail.open(task);
                  }
                : null
            }
          />
          <FocusStuckDialog
            open={focus.stuckOpen}
            onOpenChange={(next) => (next ? focus.openStuck() : focus.closeStuck())}
            todayIso={todayIso}
            onSplit={() => {
              focus.closeStuck();
              focus.openSplit();
            }}
            onError={focus.reportError}
          />
          <SplitTaskDialog
            taskId={focus.splitOpen ? active.taskId : null}
            taskTitle={active.task.title}
            todayIso={todayIso}
            onClose={focus.closeSplit}
            // Rozdelená úloha je nový začiatok — fokus sa uzavrie a človek si
            // vyberie, čo ďalej, namiesto toho, aby bežal starý odhad.
            onDone={() => void focus.stuck()}
          />
        </>
      ) : null}

      <Suspense fallback={null}>
        <FocusUrlTrigger />
      </Suspense>
    </>
  );
}

/**
 * `?fokus=1` — na tento odkaz vedie oznámenie „odhad vypršal". Otvorí
 * obrazovku a parameter z adresy zmaže, aby ho obnovenie stránky neotváralo
 * znova. Zvlášť, lebo `useSearchParams` chce hranicu `Suspense`.
 */
function FocusUrlTrigger() {
  const focus = useFocus();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wants = searchParams.get("fokus") === "1";
  const openScreen = focus?.openScreen;
  const hasActive = focus?.active != null;

  useEffect(() => {
    if (!wants) return;
    if (hasActive) openScreen?.();
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("fokus");
    const query = rest.toString();
    // Cesta je bežná adresa aktuálnej stránky — typované trasy ju poznať nemôžu.
    router.replace((query === "" ? pathname : `${pathname}?${query}`) as Route);
  }, [wants, hasActive, openScreen, router, pathname, searchParams]);

  return null;
}
