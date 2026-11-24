"use client";

import { Plus, Target } from "lucide-react";

import { EXTEND_FOCUS_MIN } from "@/lib/focus";
import { nowBarLabel, remainingLabel } from "@/lib/focus-label";
import { cn } from "@/lib/utils";

import { useFocus } from "./focus-context";

/* ═══════════════════════════════════════════════════════════════════════════
   LIŠTA „TERAZ ROBÍŠ"

   Tenký pás, kým fokus beží a obrazovka je zmenšená. Ťuknutie ju otvorí.
   Na telefóne sedí tesne nad spodnou navigáciou (provider pod obsah pridá
   rezervu), na počítači lepí navrchu obsahu — pod pruhom o pripojení.

   Po vypršaní odhadu sa pás nezačne trhať ani blikať: len zmení text a
   ponúkne „+15 min".
   ═══════════════════════════════════════════════════════════════════════════ */

export function FocusBar() {
  const focus = useFocus();
  if (focus === null || focus.active === null || focus.screenOpen) return null;

  const { active, remaining, isOver } = focus;
  const label = nowBarLabel(active.task.title, remaining ?? 0);

  return (
    <div
      className={cn(
        "z-30 flex h-14 items-center md:h-12 gap-1 border-border bg-surface px-2",
        "max-md:fixed max-md:inset-x-0 max-md:bottom-[var(--bar-inset)] max-md:border-t",
        "md:sticky md:top-0 md:border-b md:px-4",
        isOver && "shadow-[inset_3px_0_0_var(--warn)]",
      )}
    >
      <button
        type="button"
        onClick={focus.openScreen}
        aria-label={`${label}. Otvoriť fokus`}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded px-2 text-left transition-colors duration-100 hover:bg-surface-2"
      >
        <Target
          aria-hidden="true"
          className={cn("size-4 shrink-0", isOver ? "text-warn" : "text-accent")}
        />
        {/* Názov sa skracuje, čas nikdy — práve ten bar ukazuje. */}
        <span className="min-w-0 truncate text-body font-medium text-fg">
          Teraz robíš: {active.task.title}
        </span>
        <span className="shrink-0 font-mono text-meta tabular-nums text-fg-muted">
          · {remainingLabel(remaining ?? 0)}
        </span>
      </button>

      {isOver ? (
        <button
          type="button"
          onClick={() => void focus.extend()}
          disabled={focus.busy}
          className="inline-flex h-11 shrink-0 md:h-9 items-center gap-1 rounded bg-accent px-3 text-body font-medium text-accent-fg disabled:opacity-45"
        >
          <Plus aria-hidden="true" size={14} />
          {EXTEND_FOCUS_MIN} min
        </button>
      ) : null}
    </div>
  );
}
