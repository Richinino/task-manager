import type { Metadata } from "next";

import { TemplateList } from "@/components/views/sablony/template-list";
import { TemplatesHeader, TemplatesIntro } from "@/components/views/sablony/templates-header";
import { ScreenFooter } from "@/components/shell/screen-chrome";
import { countSk } from "@/lib/sk";
import { todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { listTemplates } from "@/server/queries/templates";

export const metadata: Metadata = {
  title: "Šablóny",
  description: "Predpisy na veci, ktoré sa opakujú — s relatívnymi dňami.",
};

/**
 * Obrazovka šablón.
 *
 * Šablóna je pole definícií, nie kópia existujúcich úloh — dôvod je rozpísaný
 * v `@/server/queries/templates`. Dôsledok pre túto obrazovku je jediný, ale
 * podstatný: nedá sa sem prísť „uložiť si dnešok". Predpis sa píše, nie
 * odfotí, a preto je tu editor riadkov a nie tlačidlo „zapamätať".
 *
 * Dnešok počíta SERVER v pásme používateľa a posiela ho ako reťazec. Náhľad
 * pri použití z neho odvodzuje konkrétne dni; keby si ho klient bral z
 * `new Date()`, sľuboval by po polnoci iné dátumy, než aké by reálne vznikli.
 */
export default async function SablonyPage() {
  const user = await requireUser();

  const templates = await listTemplates(user.id);
  const todayIso = todayIn(user.settings.timezone);

  return (
    <div className="flex w-full flex-col md:h-dvh">
      <TemplatesHeader templateCount={templates.length} />
      <TemplatesIntro />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <TemplateList templates={templates} todayIso={todayIso} />
      </div>

      <ScreenFooter
        summary={countSk(templates.length, "šablóna", "šablóny", "šablón")}
      />
    </div>
  );
}
