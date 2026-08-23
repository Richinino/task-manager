"use client";

import { useEffect, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { Check } from "lucide-react";

import { toggleTaskDone } from "@/server/actions/tasks";
import { cn } from "@/lib/utils";

/**
 * Zaškrtávacie políčko úlohy s optimistickým prekreslením.
 *
 * Komponent nesie **aj obal celého riadku**. Je to zámer: optimistický stav
 * „hotovo" musí okamžite ovplyvniť nielen políčko, ale aj text úlohy a odznaky.
 * Obal preto vystavuje `data-done` a triedu `group/task`, takže serverom
 * vykreslený obsah sa prefarbí čisto cez CSS — bez ďalšieho klientského stavu.
 *
 * Použitie:
 * ```tsx
 * <TaskCheckbox taskId={t.id} done={done} title={t.title} className="flex items-center gap-2">
 *   <span className="group-data-[done=true]/task:line-through">{t.title}</span>
 * </TaskCheckbox>
 * ```
 */
export interface TaskCheckboxProps {
  taskId: string;
  /** Stav zo servera. Optimistická hodnota sa naň po dobehnutí akcie vráti. */
  done: boolean;
  /** Názov úlohy — ide do aria-label políčka. */
  title: string;
  size?: "sm" | "md" | "lg";
  /** Triedy obalu riadku (layout si určuje TaskItem). */
  className?: string;
  /** Rola obalu riadku, napr. „group". */
  rowRole?: string;
  /** Zhrnutie úlohy pre čítačky; stav hotová/nedokončená sa dopĺňa automaticky. */
  rowLabel?: string;
  /** Obsah riadku — vykresľuje ho volajúci komponent. */
  children?: ReactNode;
}

export function TaskCheckbox({
  taskId,
  done,
  title,
  size = "md",
  className,
  rowRole,
  rowLabel,
  children,
}: TaskCheckboxProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDone, setOptimisticDone] = useOptimistic(done);
  const [failed, setFailed] = useState(false);

  // Hláška o chybe je nenápadná a sama zmizne — nič netreba zatvárať.
  useEffect(() => {
    if (!failed) return;
    const timer = window.setTimeout(() => setFailed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [failed]);

  function handleToggle() {
    startTransition(async () => {
      // Prekreslíme hneď; pri chybe React vráti hodnotu zo servera späť.
      setOptimisticDone(!optimisticDone);
      setFailed(false);
      try {
        const result = await toggleTaskDone(taskId);
        if (!result.ok) setFailed(true);
      } catch {
        setFailed(true);
      }
    });
  }

  const checkboxLabel = optimisticDone
    ? `Označiť úlohu „${title}“ ako nedokončenú`
    : `Označiť úlohu „${title}“ ako hotovú`;

  return (
    <div
      className={cn("group/task relative", className)}
      data-done={optimisticDone ? "true" : "false"}
      data-pending={isPending ? "true" : undefined}
      role={rowRole}
      aria-label={
        rowLabel ? `${rowLabel} ${optimisticDone ? "Hotová." : "Nedokončená."}` : undefined
      }
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={optimisticDone}
        aria-label={checkboxLabel}
        title={failed ? "Nepodarilo sa uložiť. Skús to znova." : checkboxLabel}
        onClick={handleToggle}
        className={cn(
          /*
            Zaoblený štvorec s rámom 1,5 px, nie kruh — tak to má návrh
            („Anatómia riadku": 18 px, `1.5px solid --borderS`, radius 4).
            Hotová úloha je ZELENÁ (`--succ`), nie akcentová: akcent v tomto
            návrhu znamená „tu si", nie „hotovo".
          */
          "relative flex shrink-0 items-center justify-center border-[1.5px] transition-colors",
          "cursor-pointer border-border-strong text-transparent hover:border-accent",
          optimisticDone && "border-success bg-success text-white hover:border-success",
          failed && "border-danger",
          // Telefón 24 px / radius 5, od `sm:` hustejších 18 px / radius 4.
          size === "sm"
            ? "mt-px size-4 rounded-sm"
            : size === "lg"
              // Karta priority dňa — v návrhu 20 px, väčšie než v riadku.
              ? "size-6 rounded-[5px] sm:size-5 sm:rounded-sm"
              : "size-6 rounded-[5px] sm:size-[18px] sm:rounded-sm",
          // Vizuálne koliesko ostáva 16, resp. 18 px — hustota riadku sa nemení.
          // Klikaciu plochu rozšíri neviditeľný pseudoprvok, ktorý nič nezaberá
          // v rozložení, takže riadok sa od neho nerozšíri.
          "before:absolute before:content-['']",
          // md (Dnes, Inbox): na telefóne 24 + 2×10 = 44×44 px pre palec,
          // od `sm:` späť na hustejších 26×26 px pre myš.
          // sm (týždenný stĺpec, mesačný panel): ostáva 24×24 px — to je
          // minimum podľa WCAG 2.2 SC 2.5.8 a širší presah by prekryl rúčku
          // na ťahanie, ktorá je hneď naľavo od riadku.
          size === "sm"
            ? "before:-inset-1"
            : "before:-inset-[10px] sm:before:-inset-1",
        )}
      >
        <Check aria-hidden="true" size={size === "sm" ? 10 : size === "lg" ? 13 : 12} strokeWidth={3} />
      </button>

      {children}

      {failed ? (
        <span
          role="status"
          className={cn(
            "pointer-events-none absolute right-1.5 top-1 z-10 rounded border border-danger",
            "bg-surface px-1.5 py-0.5 text-mini font-medium text-danger shadow-sm",
          )}
        >
          Nepodarilo sa uložiť
        </span>
      ) : null}
    </div>
  );
}
