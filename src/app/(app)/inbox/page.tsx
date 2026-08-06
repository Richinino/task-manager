import type { Metadata } from "next";

import { InboxList } from "@/components/views/inbox/inbox-list";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { getAreas, getInboxTasks, getProjects } from "@/server/queries/tasks";

export const metadata: Metadata = {
  title: "Inbox",
  description: "Triedenie zachytených vecí. Cieľ je prázdny inbox.",
};

export default async function InboxPage() {
  const user = await requireUser();

  const [inbox, areas, projects] = await Promise.all([
    getInboxTasks(user.id),
    getAreas(user.id),
    getProjects(user.id),
  ]);

  // Hore patrí to, čo čaká najdlhšie. Spoločné radenie dotazov stavia na
  // prioritu, ktorá v nezatriedených veciach ešte nič neznamená — v inboxe
  // rozhoduje čas zachytenia.
  const tasks = [...inbox].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6 md:py-7">
      <InboxList
        tasks={tasks}
        areas={areas}
        projects={projects}
        todayIso={todayIn(user.settings.timezone)}
        postponeWarnAt={user.settings.postponeWarnAt}
        postponeBlockAt={user.settings.postponeBlockAt}
      />
    </div>
  );
}
