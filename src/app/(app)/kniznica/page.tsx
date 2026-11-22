import type { Metadata } from "next";
import Link from "next/link";
import { Settings } from "lucide-react";

import { LibraryAccount } from "@/components/views/kniznica/library-account";
import { LibrarySearch } from "@/components/views/kniznica/library-search";
import {
  LibraryList,
  LibraryProjects,
  LibraryTiles,
} from "@/components/views/kniznica/library-sections";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { signOutAction } from "@/server/actions/auth";
import { listHabits } from "@/server/queries/habits";
import { listPillars } from "@/server/queries/learning";
import { listAreas, listProjects } from "@/server/queries/structure";
import { getCounts } from "@/server/queries/tasks";

export const metadata: Metadata = {
  title: "Knižnica",
  description: "Projekty, oblasti, návyky a odkladiská na jednom mieste.",
};

/**
 * Rázcestník pre telefón: všetko, čo nie je v spodnej lište. Na počítači
 * ostáva dosiahnuteľný z adresy, ale nikam z panela nevedie.
 */
export default async function KniznicaPage() {
  const user = await requireUser();
  const todayIso = todayIn(user.settings.timezone);

  const [projects, areas, habits, pillars, counts] = await Promise.all([
    listProjects(user.id),
    listAreas(user.id),
    listHabits(user.id, todayIso, todayIso, { todayIso }),
    listPillars(user.id),
    getCounts(user.id, todayIso),
  ]);

  const activeProjects = projects.filter(
    (project) => project.status !== "done" && project.status !== "dropped",
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-6 pt-4">
      <header className="flex items-center justify-between gap-3 px-4">
        <h1 className="font-display text-hero leading-none text-fg">Knižnica</h1>
        <Link
          href="/nastavenia"
          aria-label="Nastavenia"
          className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface text-fg-muted active:bg-surface-2"
        >
          <Settings aria-hidden="true" className="size-5" />
        </Link>
      </header>

      <div className="px-4">
        <LibrarySearch />
      </div>

      <LibraryProjects projects={activeProjects} />

      <LibraryTiles
        areas={areas.map((area) => ({ id: area.id, color: area.color }))}
        habitCount={habits.length}
        pillarCount={pillars.length}
      />

      <LibraryList somedayCount={counts.someday} waitingCount={counts.waiting} />

      <div className="px-4">
        <LibraryAccount signOutAction={signOutAction} />
      </div>
    </div>
  );
}
