import type { Metadata } from "next";

import { AgendaList } from "@/components/views/udalosti/agenda-list";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { getAgendaList } from "@/server/queries/agenda";

export const metadata: Metadata = {
  title: "Udalosti",
  description: "Písomky, udalosti a deadliny — čo sa stane a čo treba stihnúť.",
};

interface UdalostiPageProps {
  /** Next 16: `searchParams` je Promise a musí sa awaitovať. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

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
export default async function UdalostiPage({ searchParams }: UdalostiPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const todayIso = todayIn(user.settings.timezone);
  const items = await getAgendaList(user.id, todayIso);

  /*
    `?udalost=<id>` — ťuknutie na pripomienku otvorí detail tej udalosti.
    Id sa tu neoveruje: detail si udalosť načíta akciou, ktorá vlastníctvo
    kontroluje, a cudzie či zmazané id jednoducho nič neotvorí.
  */
  const raw = params["udalost"];
  const openId = typeof raw === "string" && raw.length > 0 && raw.length <= 64 ? raw : null;

  return (
    <AgendaList
      items={items}
      todayIso={todayIso}
      weekStartsOn={user.settings.weekStartsOn}
      openId={openId}
    />
  );
}
