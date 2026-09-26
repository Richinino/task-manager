import type { Metadata } from "next";

import { AgendaList } from "@/components/views/udalosti/agenda-list";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { getAgendaList } from "@/server/queries/agenda";

export const metadata: Metadata = {
  title: "Udalosti",
  description: "Písomky, udalosti a deadliny — čo sa stane a čo treba stihnúť.",
};

/**
 * Obrazovka „Udalosti".
 *
 * Písomka, lekár, výlet, odovzdanie referátu. Nie sú to úlohy: nedajú sa
 * odškrtnúť a keď prejdú, nie sú „po termíne" — sú prebehnuté. Rozhodnutia
 * sú v `docs/UDALOSTI.md`.
 *
 * Dnešok sa počíta tu, v pásme používateľa — server beží v UTC a večer by
 * inak písomku z dneška ukázal ako včerajšiu.
 */
export default async function UdalostiPage() {
  const user = await requireUser();
  const todayIso = todayIn(user.settings.timezone);
  const items = await getAgendaList(user.id, todayIso);

  return <AgendaList items={items} todayIso={todayIso} weekStartsOn={user.settings.weekStartsOn} />;
}
