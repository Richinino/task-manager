import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { CaptureProvider } from "@/components/capture/capture-provider";
import { AppShell } from "@/components/shell/app-shell";
import { TaskDetailProvider } from "@/components/task/task-detail-provider";
import { addDays, todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import {
  getAreas,
  getCounts,
  getInboxTasks,
  getProjects,
  getTasksForRange,
} from "@/server/queries/tasks";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const todayIso = todayIn(user.settings.timezone);
  const counts = await getCounts(user.id, todayIso);

  // Zoznamy pre výbery v paneli s detailom úlohy.
  const [areas, projects] = await Promise.all([
    getAreas(user.id),
    getProjects(user.id),
  ]);

  // Zásoba pre vyhľadávanie v Ctrl+K palete: naplánované okolo dneška + inbox.
  const searchTasks = [
    ...(await getTasksForRange(user.id, addDays(todayIso, -60), addDays(todayIso, 180))),
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
        <TaskDetailProvider
          areas={areas}
          projects={projects}
          todayIso={todayIso}
          postponeWarnAt={user.settings.postponeWarnAt}
          postponeBlockAt={user.settings.postponeBlockAt}
        >
          {children}
        </TaskDetailProvider>
      </CaptureProvider>
    </AppShell>
  );
}
