import type { ReactNode } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

import { MobileNav } from "./mobile-nav";
import { Sidebar, type NavCounts } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

export interface AppShellProps {
  user: { name: string | null; email: string };
  counts: NavCounts;
  /** Serverová akcia z layoutu — odhlásenie. */
  signOutAction: () => Promise<void>;
  children: ReactNode;
}

/**
 * Kostra prihlásenej časti: pripnutý sidebar na desktope,
 * hlavička + spodná lišta na telefóne.
 */
export function AppShell({ user, counts, signOutAction, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar user={user} counts={counts} signOutAction={signOutAction} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Na telefóne nie je sidebar, takže téma a odhlásenie musia byť tu.
          Lišta je 3.5rem vysoká, aby sa do nej zmestili dotykové ciele 44 px —
          na 12 rem (48 px) by sa prepínač témy nevošiel.
        */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-bg/90 px-3 backdrop-blur-sm md:hidden">
          <span className="min-w-0 truncate text-[13px] font-semibold tracking-tight text-fg">
            Task manažér
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <form action={signOutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                aria-label="Odhlásiť sa"
                className="size-11 md:size-8"
              >
                <LogOut className="size-[18px] md:size-4" />
              </Button>
            </form>
          </div>
        </header>

        {/*
          Spodný odstup na telefóne musí uvoľniť všetko, čo nad obsahom pláva:
            3.5rem  spodná lišta (`mobile-nav`)
          + safe-area-inset-bottom  gesture bar telefónu
          + 0.75rem + 3rem  plávajúce tlačidlo zachytenia (`capture-provider`)
          Indikátor pripojenia sedí medzi lištou a tlačidlom, takže sa uvoľní
          spolu s ním. Bez toho posledné riadky zoznamu končia pod tlačidlom.
        */}
        <main className="min-w-0 flex-1 pb-[calc(7.25rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </div>

      <MobileNav counts={counts} />
    </div>
  );
}
