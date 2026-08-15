import type { Metadata } from "next";

import { HabitList } from "@/components/views/navyky/habit-list";
import { HabitsHeader } from "@/components/views/navyky/habits-header";
import type { HabitAreaOption } from "@/components/views/navyky/habit-types";
import { addDays, startOfWeek, todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import { listHabits } from "@/server/queries/habits";
import { listAreas } from "@/server/queries/structure";

export const metadata: Metadata = {
  title: "Návyky",
  description: "Týždenné ciele a série — veci, ktoré sa nedokončujú, ale udržujú.",
};

/* ═══════════════════════════════════════════════════════════════════════════
   NÁVYKY

   PREČO NÁVYK NEZAPĹŇA DEŇ — jadro celého návrhu

   Návyk sa v tejto aplikácii nikdy nedostane do „Dnes", do `getTasksForDay`,
   do `getActionableTasks` ani do rozpočtu času. Nie je to opomenutie ani vec,
   ktorú treba dorobiť. Je to rozhodnutie, na ktorom stojí zvyšok appky:

   1. **Deň má strop a návyky ho zožerú.** Obrazovka „Dnes" má WIP limit z M5 —
      pridať šiestu úlohu znamená niečo iné odobrať, a práve to núti človeka
      rozhodovať sa. Sedem návykov typu „napiť sa vody", „vitamíny", „strečing"
      by ten limit vyčerpalo skôr, než by sa v dni objavila prvá skutočná práca.
      Limit by sa musel zdvihnúť a tým by stratil zmysel. Deň by bol plný a
      pritom by sa v ňom nič neposunulo.

   2. **Návyk sa neplní na deň, ale na týždeň.** Úloha má termín a nesplnený
      termín je prepadnutie — to je správne, faktúra po splatnosti je problém.
      Návyk má `targetPerWeek`, teda cieľ „X× do týždňa". Keby sa vykresľoval
      ako denná položka, každý neodškrtnutý deň by sa tváril ako zlyhanie,
      hoci pri cieli 4× do týždňa sú tri vynechané dni v poriadku. Appka, ktorá
      človeka trestá za to, čo mu sama dovolila, ho naučí ignorovať červené —
      a s ním aj skutočne prepadnuté úlohy.

   3. **Séria sa preto počíta na týždne, nie na dni.** Denná séria zlomená
      jedným prechladnutím zmaže mesiac poctivej práce a je to presne ten
      moment, keď to ľudia vzdávajú. Týždenná séria prežije zlý deň a
      prebiehajúci týždeň ju nezhadzuje — človek má do nedele čas a appka ho
      nemá odpisovať vo štvrtok. (Podrobne v `src/lib/habits.ts`.)

   Návyky preto žijú tu, na vlastnej obrazovke, a jediné, čo o nich deň vie, je
   odškrtnutie dneška jedným ťuknutím. Meria sa mriežkou a sériou, nie tým,
   koľko riadkov zaberú v zozname úloh.

   ─────────────────────────────────────────────────────────────────────────

   Okno je 12 týždňov. Kratšie by z mriežky spravilo ozdobu bez výpovede,
   dlhšie by sa na telefóne nedalo prečítať. Tri mesiace sú zároveň to obdobie,
   po ktorom sa dá o návyku poctivo povedať, či drží.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Koľko týždňov má mriežka. */
const GRID_WEEKS = 12;

export default async function NavykyPage() {
  const user = await requireUser();

  const weekStartsOn = user.settings.weekStartsOn;
  /*
    Dnešok sa počíta TU, v pásme používateľa, a putuje dole ako prop. Proces
    beží na Verceli v UTC a `new Date()` v prehliadači by po hydratácii dal
    iný deň než server — mriežka by preblikla o stĺpec a odškrtnutie by
    trafilo včerajšok. Toto pravidlo nás už raz stálo opravnú fázu.
  */
  const todayIso = todayIn(user.settings.timezone);

  /*
    Okno začína na začiatku týždňa, nie „pred 84 dňami": prvý stĺpec mriežky
    musí byť celý týždeň, inak by mu chýbali dni zľava a človek by v ňom videl
    vynechávanie, ktoré sa nestalo. Končí dneškom — budúcnosť sa nedá splniť.
  */
  const fromIso = startOfWeek(addDays(todayIso, -7 * (GRID_WEEKS - 1)), weekStartsOn);
  const toIso = todayIso;

  const [habits, areas] = await Promise.all([
    // Archivované sa načítavajú spolu so živými: sú v zbalenom archíve dole
    // a druhý dotaz kvôli hŕstke riadkov by bola zbytočná cesta do databázy.
    listHabits(user.id, fromIso, toIso, {
      weekStartsOn,
      todayIso,
      includeArchived: true,
    }),
    listAreas(user.id, { includeArchived: true }),
  ]);

  /*
    Dni mriežky skladá server, nie karta.

    Je to tá istá tabuľka pre všetky návyky, takže sa poskladá raz, a hlavne:
    v klientovi by na to bolo treba dnešok a prácu s dátumami okolo neho.
    Takto klient dostane hotové reťazce a nič si nepočíta z „teraz".
  */
  const weeks: string[][] = [];
  for (let week = 0; week < GRID_WEEKS; week += 1) {
    const weekStart = addDays(fromIso, week * 7);
    const days: string[] = [];
    for (let day = 0; day < 7; day += 1) days.push(addDays(weekStart, day));
    weeks.push(days);
  }

  const areaOptions: HabitAreaOption[] = areas.map((area) => ({
    id: area.id,
    name: area.name,
    color: area.color,
    archived: area.archivedAt !== null,
  }));

  const active = habits.filter((habit) => habit.archivedAt === null);
  const archived = habits.filter((habit) => habit.archivedAt !== null);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 md:px-6 md:py-7">
      <HabitsHeader activeCount={active.length} />

      <HabitList
        active={active}
        archived={archived}
        areas={areaOptions}
        weeks={weeks}
        fromIso={fromIso}
        toIso={toIso}
        todayIso={todayIso}
        weekStartsOn={weekStartsOn}
      />
    </div>
  );
}
