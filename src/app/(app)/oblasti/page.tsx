import type { Metadata } from "next";

import { AreaList } from "@/components/views/oblasti/area-list";
import { AreasHeader, AreasIntro } from "@/components/views/oblasti/areas-header";
import { ScreenFooter } from "@/components/shell/screen-chrome";
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
    <div className="flex w-full flex-col md:h-dvh">
      <AreasHeader activeCount={active.length} />
      <AreasIntro />
      <AreaList active={active} archived={archived} />
      <ScreenFooter
        summary={`${active.length} aktívnych · ${active.reduce((sum, area) => sum + area.openTaskCount, 0)} nevybavených${archived.length > 0 ? ` · ${archived.length} v archíve` : ""}`}
      />
    </div>
  );
}
