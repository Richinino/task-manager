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
  size?: "sm" | "md";
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
    ? `Označiť úlohu „${title}" ako nedokončenú`
    : `Označiť úlohu „${title}" ako hotovú`;

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
          "relative flex shrink-0 items-center justify-center rounded-full border transition-colors",
          "cursor-pointer border-border-strong text-transparent hover:border-accent",
          optimisticDone && "border-accent bg-accent text-accent-fg hover:border-accent",
          failed && "border-danger",
          size === "sm" ? "mt-px size-4" : "size-[18px]",
          // Vizuálne koliesko ostáva 16, resp. 18 px — hustota riadku sa nemení.
          // Klikaciu plochu ale rozšíri neviditeľný pseudoprvok na 24×24,
          // resp. 26×26 px, aby sa palcom dala trafiť (WCAG 2.2 SC 2.5.8).
          // Presah ide do vlastného paddingu riadku, takže rúčku na ťahanie
          // vedľa neprekryje.
          "before:absolute before:-inset-1 before:content-['']",
        )}
      >
        <Check aria-hidden="true" size={size === "sm" ? 10 : 12} strokeWidth={3} />
      </button>

      {children}

      {failed ? (
        <span
          role="status"
          className={cn(
            "pointer-events-none absolute right-1.5 top-1 z-10 rounded border border-danger",
            "bg-surface px-1.5 py-0.5 text-[11px] font-medium text-danger shadow-sm",
          )}
        >
          Nepodarilo sa uložiť
        </span>
      ) : null}
    </div>
  );
}
