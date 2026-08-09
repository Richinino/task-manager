import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectDangerZone } from "@/components/views/projekty/project-danger-zone";
import { ProjectDetail } from "@/components/views/projekty/project-detail";
import { ProjectTasks } from "@/components/views/projekty/project-tasks";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { getProject } from "@/server/queries/structure";
import { getAreas, getProjectTasks } from "@/server/queries/tasks";

export const metadata: Metadata = {
  title: "Projekt",
};

/**
 * Detail projektu.
 *
 * Zhora nadol: hlava, ktorú sa dá prepísať → úlohy → správa projektu.
 * Poradie je zámerné — archivácia a mazanie patria pod všetko ostatné,
 * aby sa na ne nedalo kliknúť omylom pri hľadaní niečoho iného.
 */
export default async function ProjektDetailPage({
  // Next 16: `params` je Promise, musí sa awaitovať.
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const project = await getProject(user.id, id);
  if (project === null) notFound();

  const [projectTasks, activeAreas] = await Promise.all([
    getProjectTasks(user.id, project.id),
    getAreas(user.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-5 md:px-6 md:py-7">
      <ProjectDetail
        project={project}
        areas={activeAreas}
        // Dnešok z pásma používateľa, nie z pásma servera.
        todayIso={todayIn(user.settings.timezone)}
      />

      <ProjectTasks
        tasks={projectTasks}
        todayIso={todayIn(user.settings.timezone)}
        postponeWarnAt={user.settings.postponeWarnAt}
        postponeBlockAt={user.settings.postponeBlockAt}
      />

      <ProjectDangerZone
        projectId={project.id}
        projectName={project.name}
        archived={project.archivedAt !== null}
        taskCount={project.openTaskCount + project.doneTaskCount}
      />
    </div>
  );
}
