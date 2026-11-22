import type { ReactNode } from "react";

import { Sidebar, type NavCounts } from "./sidebar";

export interface AppShellProps {
  user: { name: string | null; email: string };
  counts: NavCounts;
  /** Serverová akcia z layoutu — odhlásenie. */
  signOutAction: () => Promise<void>;
  children: ReactNode;
}

/**
 * Kostra prihlásenej časti: pripnutý sidebar na desktope,
 * spodná lišta na telefóne (tú vykresľuje layout vnútri `CaptureProvider`,
 * lebo jej „+" otvára zachytenie).
 */
export function AppShell({ user, counts, signOutAction, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar user={user} counts={counts} signOutAction={signOutAction} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Spodný odstup na telefóne uvoľní spodnú lištu aj s výrezom telefónu
          (`--bar-inset`) a malú rezervu. Plávajúce tlačidlo zachytenia už
          nie je — „+" je súčasťou lišty. Téma a odhlásenie sú v Knižnici.
        */}
        <main className="min-w-0 flex-1 pb-[calc(var(--bar-inset)+1rem)] md:pb-0">
          {children}
        </main>
      </div>

    </div>
  );
}
