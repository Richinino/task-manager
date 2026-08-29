import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

import { ScreenHeader } from "@/components/shell/screen-chrome";
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

  const todayIso = todayIn(user.settings.timezone);
  const total = project.openTaskCount + project.doneTaskCount;

  return (
    <div className="flex w-full flex-col md:h-dvh">
      {/*
        Drobec, nie nadpis. Detail projektu je jediná obrazovka, z ktorej sa
        dá „ísť späť", a návrh na to používa cestu `Projekty / názov` —
        vlastný nadpis by rovnakú informáciu povedal dvakrát.
      */}
      <ScreenHeader
        title={
          <span className="flex min-w-0 items-center gap-2.5">
            <Link
              href="/projekty"
              className="inline-flex shrink-0 items-center gap-1.5 text-body font-normal text-fg-muted transition-colors duration-100 ease-out hover:text-fg"
            >
              <ArrowLeft aria-hidden="true" size={13} className="shrink-0" />
              Projekty
            </Link>
            <span aria-hidden="true" className="shrink-0 font-mono text-mini text-fg-subtle">
              /
            </span>
            <span className="min-w-0 truncate text-body font-medium text-fg">
              {project.name}
            </span>
          </span>
        }
        meta={total === 0 ? "zatiaľ bez úloh" : `hotové ${project.doneTaskCount} z ${total}`}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/*
          Ľavý stĺpec má v návrhu 520 px. Je to formulár — širší by mal
          zbytočne dlhé riadky, užší by nezniesol dve polia vedľa seba.
        */}
        <div className="flex min-h-0 flex-col overflow-y-auto border-border lg:w-[520px] lg:shrink-0 lg:border-r">
          <ProjectDetail project={project} areas={activeAreas} todayIso={todayIso} />

          <div className="flex-1" />

          <ProjectDangerZone
            projectId={project.id}
            projectName={project.name}
            archived={project.archivedAt !== null}
            taskCount={total}
          />

          <p className="shrink-0 border-t border-border px-5 py-3 text-pretty text-mini leading-normal text-fg-subtle">
            Tlačidlo „Uložiť“ tu nie je — každá zmena sa ukladá sama. Texty pri
            opustení poľa alebo klávesmi Ctrl a Enter.
          </p>
        </div>

        <ProjectTasks
          tasks={projectTasks}
          todayIso={todayIso}
          postponeWarnAt={user.settings.postponeWarnAt}
          postponeBlockAt={user.settings.postponeBlockAt}
        />
      </div>
    </div>
  );
}
