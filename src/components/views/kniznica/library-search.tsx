"use client";

import { Search } from "lucide-react";

import { useCapture } from "@/components/capture/capture-provider";

/**
 * Pole, ktoré vyzerá ako vyhľadávanie, ale je to tlačidlo: otvorí paletu
 * príkazov (Ctrl+K), ktorá hľadá v úlohách, udalostiach aj obrazovkách.
 */
export function LibrarySearch() {
  const { openPalette } = useCapture();

  return (
    <button
      type="button"
      onClick={openPalette}
      className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 text-left text-row text-fg-subtle active:bg-surface-2"
    >
      <Search aria-hidden="true" className="size-[18px] shrink-0" />
      <span className="min-w-0 truncate">Hľadať v úlohách, projektoch, nápadoch</span>
    </button>
  );
}
