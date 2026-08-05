import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { AppShell } from "@/components/shell/app-shell";
import { today } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { getCounts } from "@/server/queries/tasks";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const counts = await getCounts(user.id, today());

  async function signOutAction(): Promise<void> {
    "use server";
    await signOut({ redirectTo: "/prihlasenie" });
  }

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      counts={counts}
      signOutAction={signOutAction}
    >
      {children}
    </AppShell>
  );
}
