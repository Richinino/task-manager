import type { Metadata } from "next";

import { ProjectList } from "@/components/views/projekty/project-list";
import { ProjectsHeader } from "@/components/views/projekty/projects-header";
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 md:px-6 md:py-7">
      <ProjectsHeader activeCount={active.length} />
      <ProjectList
        active={active}
        archived={archived}
        areas={areas}
        // Dnešok berieme z pásma používateľa, nie z pásma procesu — na Verceli
        // (UTC) by inak medzi polnocou a druhou v noci svietili včerajšie termíny.
        todayIso={todayIn(user.settings.timezone)}
      />
    </div>
  );
}
