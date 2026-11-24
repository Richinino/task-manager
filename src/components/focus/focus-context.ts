"use client";

import { createContext, useContext } from "react";

import type { ActiveFocus } from "@/server/queries/focus";
import type { TaskWithRelations } from "@/server/queries/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   KONTEXT FOKUSU

   Zvlášť od providera: obrazovka, lišta aj dialóg čítajú kontext a provider
   ich všetky vykresľuje. Keby kontext býval v provideri, vznikol by kruhový
   import.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface FocusContextValue {
  /** Bežiaci fokus, alebo `null`. */
  active: ActiveFocus | null;
  /** Posledný tik hodín v ms — mení sa najviac raz za minútu. */
  nowMs: number;
  /** Minúty do konca odhadu (záporné po termíne), `null` bez fokusu. */
  remaining: number | null;
  /** Odhad vypršal. */
  isOver: boolean;
  /** Odpracované minúty na aktívnej úlohe cez všetky úseky. */
  spentMin: number;
  /** Podiel úseku 0 až 1. */
  progress: number;
  /** Akcia práve beží na serveri. */
  busy: boolean;
  screenOpen: boolean;
  /** Beží fokus práve na tejto úlohe? */
  isActiveTask: (taskId: string) => boolean;
  /**
   * Začne fokus na úlohe a otvorí obrazovku (`openScreen: false` ju nechá
   * zavretú). Keď už beží fokus na tej istej úlohe, len ju otvorí.
   * Vráti `true`, keď fokus beží.
   */
  start: (task: TaskWithRelations, options?: { openScreen?: boolean }) => Promise<boolean>;
  pause: () => Promise<void>;
  /** „+15 min". */
  extend: () => Promise<void>;
  finish: (complete: boolean) => Promise<void>;
  /** Ukončí fokus s dôvodom „zasekol som sa". */
  stuck: () => Promise<void>;
  openScreen: () => void;
  closeScreen: () => void;
  /** Dialóg „Zasekol som sa". */
  openStuck: () => void;
  /** Rozdelenie úlohy z fokusu. */
  openSplit: () => void;
  stuckOpen: boolean;
  splitOpen: boolean;
  closeStuck: () => void;
  closeSplit: () => void;
  /** Hláška v živej oblasti providera (rovnaká, akú ukazujú akcie fokusu). */
  reportError: (message: string) => void;
}

const FocusContext = createContext<FocusContextValue | null>(null);

export const FocusContextProvider = FocusContext.Provider;

/**
 * Vráti `null` mimo providera — rovnako ako `useTaskDetail`. Tlačidlá „Začať"
 * sa používajú aj tam, kde fokus nie je, a majú vtedy otvoriť aspoň detail.
 */
export function useFocus(): FocusContextValue | null {
  return useContext(FocusContext);
}
