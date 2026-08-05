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
        {/* Na telefóne nie je sidebar, takže téma a odhlásenie musia byť tu. */}
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-bg/90 px-3 backdrop-blur-sm md:hidden">
          <span className="truncate text-[13px] font-semibold tracking-tight text-fg">
            Task manažér
          </span>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="icon" aria-label="Odhlásiť sa">
                <LogOut className="size-4" />
              </Button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
      </div>

      <MobileNav counts={counts} />
    </div>
  );
}
