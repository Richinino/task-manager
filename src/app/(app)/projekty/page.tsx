import type { Metadata } from "next";

import { ProjectList } from "@/components/views/projekty/project-list";
import {
  ProjectsHeader,
  ProjectsIntro,
  projectCountLabel,
} from "@/components/views/projekty/projects-header";
import { ProjectsRail } from "@/components/views/projekty/projects-rail";
import { ScreenFooter } from "@/components/shell/screen-chrome";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { listProjects } from "@/server/queries/structure";
import { getAreas } from "@/server/queries/tasks";

export const metadata: Metadata = {
  title: "Projekty",
  description: "Úlohy, ktoré majú spoločný cieľ a koniec.",
};

/**
 * Zoznam projektov.
 *
 * Archivované sa ťahajú tým istým dotazom (`includeArchived`) a delia sa
 * až tu — dva dotazy nad tou istou tabuľkou by pri prepnutí archívu museli
 * bežať znovu a čísla by sa mohli rozísť.
 */
export default async function ProjektyPage() {
  const user = await requireUser();

  const [all, areas] = await Promise.all([
    listProjects(user.id, { includeArchived: true }),
    getAreas(user.id),
  ]);

  const active = all.filter((project) => project.archivedAt === null);
  const archived = all.filter((project) => project.archivedAt !== null);

  // Dnešok berieme z pásma používateľa, nie z pásma procesu — na Verceli (UTC)
  // by inak medzi polnocou a druhou v noci svietili včerajšie termíny.
  const todayIso = todayIn(user.settings.timezone);

  const openTotal = active.reduce((sum, project) => sum + project.openTaskCount, 0);

  return (
    <div className="flex w-full flex-col md:h-dvh">
      <ProjectsHeader activeCount={active.length} />
      <ProjectsIntro />

      <div className="flex min-h-0 flex-1">
        <ProjectList
          active={active}
          archived={archived}
          areas={areas}
          todayIso={todayIso}
        />

        <ProjectsRail active={active} areas={areas} todayIso={todayIso} />
      </div>

      <ScreenFooter
        summary={`${projectCountLabel(active.length)} · ${openTotal} nevybavených${archived.length > 0 ? ` · ${archived.length} v archíve` : ""}`}
      />
    </div>
  );
}
