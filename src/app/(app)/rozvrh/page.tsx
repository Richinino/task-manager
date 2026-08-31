import type { Metadata } from "next";

import { ScreenFooter, ScreenHeader } from "@/components/shell/screen-chrome";
import { NamesPanel } from "@/components/views/rozvrh/names-panel";
import { ScheduleImport } from "@/components/views/rozvrh/schedule-import";
import { WeekGrid } from "@/components/views/rozvrh/week-grid";
import { formatDuration, minutesIn, todayIn, weekDays } from "@/lib/dates";
import { schoolMinutes } from "@/lib/school";
import { countSk } from "@/lib/sk";
import { requireUser } from "@/server/auth-guard";
import {
  getLessonsForRange,
  listSubjects,
  listTeachers,
} from "@/server/queries/school";

export const metadata: Metadata = {
  title: "Rozvrh",
  description: "Školský týždeň — hodiny sa odškrtávajú samy podľa času.",
};

/* ═══════════════════════════════════════════════════════════════════════════
   ROZVRH

   HODINA SA NIKDY NEZAPISUJE AKO HOTOVÁ

   Je hotová vtedy, keď jej čas prešiel — porovná sa s hodinami a nič sa
   neuloží. Je to tá istá myšlienka ako pri lekcii (dokončená úloha
   s pilierom, žiadna tabuľka lekcií) a pri splnenom dni návyku (zlúčenie
   dvoch zdrojov). Dôvod je vždy rovnaký: **čo sa nikam nekopíruje, to sa
   nemá ako rozísť.** Keď si v piatok pozrieš pondelok, uvidíš ho správne.

   A hodina nikdy nevyrobí úlohu. Tridsať riadkov týždenne by zabilo WIP
   limit rovnako, ako by ho zabili návyky.

   Rozhodnutia k celému podprojektu sú v `docs/ROZVRH.md`.
   ═══════════════════════════════════════════════════════════════════════════ */

export default async function RozvrhPage() {
  const user = await requireUser();

  const todayIso = todayIn(user.settings.timezone);
  const dni = weekDays(todayIso, user.settings.weekStartsOn);

  /*
    Víkend sa nekreslí, keď v ňom nič nie je — prázdne riadky by z mriežky
    urobili tabuľku, ktorá je z tretiny o ničom. Keby škola raz mala sobotu,
    riadok sa objaví sám, lebo sa odvodzuje z dát.
  */
  const prvy = dni[0] ?? todayIso;
  const posledny = dni[dni.length - 1] ?? todayIso;
  const [hodiny, predmety, ucitelia] = await Promise.all([
    getLessonsForRange(user.id, prvy, posledny),
    listSubjects(user.id),
    listTeachers(user.id),
  ]);

  const dniSHodinami = dni.filter((den) => hodiny.some((h) => h.date === den));
  const tyzdenMin = schoolMinutes(hodiny);

  const meta =
    hodiny.length === 0
      ? "zatiaľ prázdny"
      : `${countSk(hodiny.length, "hodina", "hodiny", "hodín")} · ${formatDuration(tyzdenMin)}`;

  return (
    <div className="flex w-full flex-col md:h-dvh">
      <ScreenHeader title="Rozvrh" meta={meta} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b border-border px-2 py-2">
          <WeekGrid
            days={dniSHodinami}
            lessons={hodiny.map((h) => ({
              id: h.id,
              date: h.date,
              period: h.period,
              startTime: h.startTime,
              endTime: h.endTime,
              subjectCode: h.subjectCode,
              subjectColor: h.subjectColor,
              room: h.room,
              cancelled: h.cancelled,
              hasNote: h.note !== null || h.subjectNote !== null,
            }))}
            todayIso={todayIso}
            nowMin={minutesIn(user.settings.timezone)}
            timeZone={user.settings.timezone}
          />
        </div>

        <ScheduleImport chosen={user.settings.schoolGroups} />

        <NamesPanel
          subjects={predmety.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            color: p.color,
          }))}
          teachers={ucitelia.map((t) => ({ id: t.id, code: t.code, name: t.name }))}
        />
      </div>

      <ScreenFooter
        summary={
          hodiny.length === 0
            ? "žiadne hodiny"
            : countSk(dniSHodinami.length, "školský deň", "školské dni", "školských dní")
        }
      />
    </div>
  );
}
