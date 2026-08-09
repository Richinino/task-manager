import type { Metadata } from "next";

import { AreaList } from "@/components/views/oblasti/area-list";
import { AreasHeader } from "@/components/views/oblasti/areas-header";
import { requireUser } from "@/server/auth-guard";
import { listAreas } from "@/server/queries/structure";

export const metadata: Metadata = {
  title: "Oblasti",
  description: "Okruhy života, ktoré sa len udržiavajú a nikdy nekončia.",
};

/**
 * Zoznam oblastí.
 *
 * Nie je tu žiadny dátum a zámerne ani žiadny `todayIso`: oblasť nemá termín
 * ani plán, takže nie je čo počítať voči dnešku.
 */
export default async function OblastiPage() {
  const user = await requireUser();

  const all = await listAreas(user.id, { includeArchived: true });
  const active = all.filter((area) => area.archivedAt === null);
  const archived = all.filter((area) => area.archivedAt !== null);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 md:px-6 md:py-7">
      <AreasHeader activeCount={active.length} />
      <AreaList active={active} archived={archived} />
    </div>
  );
}
