import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { CaptureProvider } from "@/components/capture/capture-provider";
import { AppShell } from "@/components/shell/app-shell";
import { addDays, today } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { getCounts, getInboxTasks, getTasksForRange } from "@/server/queries/tasks";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const counts = await getCounts(user.id, today());

  // Zásoba pre vyhľadávanie v Ctrl+K palete: naplánované okolo dneška + inbox.
  const searchTasks = [
    ...(await getTasksForRange(user.id, addDays(today(), -60), addDays(today(), 180))),
    ...(await getInboxTasks(user.id)),
  ];

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
      <CaptureProvider tasks={searchTasks} weekStartsOn={user.settings.weekStartsOn}>
        {children}
      </CaptureProvider>
    </AppShell>
  );
}
