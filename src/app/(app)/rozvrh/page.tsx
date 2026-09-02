import type { Metadata } from "next";

import { ScreenFooter, ScreenHeader } from "@/components/shell/screen-chrome";
import { BreaksPanel } from "@/components/views/rozvrh/breaks-panel";
import { WeekNav } from "@/components/views/rozvrh/week-nav";
import { NamesPanel } from "@/components/views/rozvrh/names-panel";
import { ScheduleImport } from "@/components/views/rozvrh/schedule-import";
import { WeekGrid } from "@/components/views/rozvrh/week-grid";
import { addDays, formatDuration, minutesIn, todayIn, weekDays } from "@/lib/dates";
import { schoolBreakOn, schoolMinutes } from "@/lib/school";
import { countSk } from "@/lib/sk";
import { requireUser } from "@/server/auth-guard";
import {
  getLessonsForRange,
  listBreaks,
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

interface RozvrhPageProps {
  /** Next 16: `searchParams` je Promise a musí sa awaitovať. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Kotva týždňa z `?od=RRRR-MM-DD`. Neplatný dátum sa ticho zahodí. */
function readAnchor(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : raw;
}

export default async function RozvrhPage({ searchParams }: RozvrhPageProps) {
  const user = await requireUser();
  const params = await searchParams;

  const todayIso = todayIn(user.settings.timezone);
  const kotva = readAnchor(params["od"]) ?? todayIso;
  const dni = weekDays(kotva, user.settings.weekStartsOn);

  /*
    Víkend sa nekreslí, keď v ňom nič nie je — prázdne riadky by z mriežky
    urobili tabuľku, ktorá je z tretiny o ničom. Keby škola raz mala sobotu,
    riadok sa objaví sám, lebo sa odvodzuje z dát.
  */
  const prvy = dni[0] ?? todayIso;
  const posledny = dni[dni.length - 1] ?? todayIso;
  const predchadzajuci = addDays(prvy, -7);
  const nasledujuci = addDays(prvy, 7);
  const [hodiny, predmety, ucitelia, volna] = await Promise.all([
    getLessonsForRange(user.id, prvy, posledny),
    listSubjects(user.id),
    listTeachers(user.id),
    listBreaks(user.id),
  ]);

  /*
    Ktorý školský rok ponúknuť.

    Hranica je AUGUST, nie september. Školský rok 2025/2026 síce formálne beží
    do 31. augusta, ale koncom augusta už nikoho nezaujíma — vtedy sa človek
    pripravuje na ten, čo o týždeň začína. Ponúkať mu sviatky, ktoré všetky
    dávno prešli, by bolo doslova k ničomu.
  */
  const skolskyRok =
    Number(todayIso.slice(0, 4)) - (todayIso.slice(5, 7) < "08" ? 1 : 0);

  /*
    Deň sa kreslí, keď v ňom niečo JE — hodina alebo voľno. Víkend tak vypadne
    sám, ale prázdninový utorok ostane aj s dôvodom, prečo je prázdny.
  */
  /*
    Hodiny, ktoré v ten deň naozaj sú. Voľno prekryje celý deň, takže sa
    nekreslia ani nerátajú — inak by hlavička hlásila „32 hodín" nad
    mriežkou, v ktorej ich je vidieť dvadsaťpäť, a to číslo by neplatilo
    o ničom.
  */
  const hodinyMimoVolna = hodiny.filter((h) => schoolBreakOn(h.date, volna) === null);

  const dniSHodinami = dni.filter(
    (den) =>
      hodinyMimoVolna.some((h) => h.date === den) || schoolBreakOn(den, volna) !== null,
  );
  const tyzdenMin = schoolMinutes(hodinyMimoVolna);

  const meta =
    hodiny.length === 0
      ? "zatiaľ prázdny"
      : `${countSk(hodinyMimoVolna.length, "hodina", "hodiny", "hodín")} · ${formatDuration(tyzdenMin)}`;

  return (
    <div className="flex w-full flex-col md:h-dvh">
      <ScreenHeader
        title="Rozvrh"
        meta={meta}
        chip={dni.includes(todayIso) ? "tento týždeň" : undefined}
      >
        <WeekNav
          previous={`/rozvrh?od=${predchadzajuci}`}
          next={`/rozvrh?od=${nasledujuci}`}
          today={dni.includes(todayIso) ? null : "/rozvrh"}
        />
      </ScreenHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b border-border px-2 py-2">
          <WeekGrid
            days={dniSHodinami}
            lessons={hodinyMimoVolna.map((h) => ({
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
            breaks={volna.map((v) => ({
              fromDate: v.fromDate,
              toDate: v.toDate,
              label: v.label,
            }))}
            todayIso={todayIso}
            nowMin={minutesIn(user.settings.timezone)}
            timeZone={user.settings.timezone}
            emptyHint={
              predmety.length === 0
                ? "Zatiaľ tu nič nie je. Načítaj rozvrh nižšie."
                : "V tomto týždni nič nie je — prázdniny alebo leto."
            }
          />
        </div>

        <ScheduleImport
          chosen={user.settings.schoolGroups}
          hasFeed={(process.env.SKOLA_ICS_URL ?? "").trim() !== ""}
        />

        <BreaksPanel
          breaks={volna.map((v) => ({
            id: v.id,
            fromDate: v.fromDate,
            toDate: v.toDate,
            label: v.label,
          }))}
          schoolYear={skolskyRok}
        />

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
