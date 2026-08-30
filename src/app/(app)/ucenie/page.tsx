import type { Metadata } from "next";

import { ScreenFooter, ScreenHeader } from "@/components/shell/screen-chrome";
import { LearningBoard } from "@/components/views/ucenie/learning-board";
import type { PillarItem } from "@/components/views/ucenie/learning-types";
import { formatDuration, todayIn } from "@/lib/dates";
import { OKNO_DNI } from "@/lib/learning";
import { countSk } from "@/lib/sk";
import { requireUser } from "@/server/auth-guard";
import { getLearningOverview } from "@/server/queries/learning";

export const metadata: Metadata = {
  title: "Učenie",
  description: "Piliere, zručnosti a míľniky — postup, o ktorý sa nedá prísť.",
};

/* ═══════════════════════════════════════════════════════════════════════════
   UČENIE

   PREČO TU NIE SÚ BODY A SÉRIE

   Celá appka stojí na vete „zoznam, ktorý nedáva pocit, že si pozadu". Body,
   ktoré klesajú, a série, ktoré sa lámu, sú presný opak — fungujú na miernom
   pocite viny a v deň, keď ochorieš, ťa potrestajú za to, že si chorý.
   Namiesto nich sú tu dve veci:

   1. **Hodnosť je západka.** Odvodzuje sa z dosiahnutých míľnikov a nedá sa
      o ňu prísť. Keď raz otvoríš ten zámok, vieš to navždy — a míľnik je
      overiteľná veta, takže sa nedá nafúknuť ničím iným než skutkom.

   2. **Séria je kĺzavé okno.** „Za 30 dní 11 lekcií" nesie tú istú informáciu
      ako „11 dní v rade", ale nezlomí sa jedným zlým týždňom. Klesnúť môže,
      zlomiť sa nie.

   ─────────────────────────────────────────────────────────────────────────

   A prečo je učenie samostatná sekcia, keď oblasti už existujú: oblasť
   odpovedá na „do ktorej časti života to patrí". Všetko učenie by preto
   padlo do jednej oblasti a rozdelenie by nepovedalo nič. Pilier odpovedá na
   niečo iné — „v akej doméne rastiem" — a preto stojí samostatne.

   Lekcia je pritom stále obyčajná úloha. Nezakladá sa tu; vzniká tým, že
   dokončíš úlohu, ktorej si dal pilier. Vďaka tomu zaberá rozpočet dňa
   (učenie fyzicky zaberá čas) a nemôže sa rozísť s úlohou, z ktorej vznikla.
   ═══════════════════════════════════════════════════════════════════════════ */

export default async function UceniePage() {
  const user = await requireUser();

  /*
    Dnešok sa počíta TU, v pásme používateľa. Proces beží na Verceli v UTC,
    takže `new Date()` na serveri by pri večernom učení posunul lekciu o deň
    a okno by ju spočítalo inde, než sa naozaj stala.
  */
  const todayIso = todayIn(user.settings.timezone);
  /*
    Archivované sa načítavajú spolu so živými. Sú v zbalenom archíve dole a
    druhý dotaz kvôli hŕstke riadkov by bola zbytočná cesta do databázy —
    rovnako to robí obrazovka návykov.

    Do súčtov sa pritom počítajú: lekcia, ktorá sa stala, sa stala, aj keď si
    ten pilier medzitým odložil. Archív je o tom, čo appka ponúka do budúcna,
    nie o prepisovaní minulosti.
  */
  const prehlad = await getLearningOverview(user.id, user.settings.timezone, {
    todayIso,
    includeArchived: true,
  });

  const pillars: PillarItem[] = prehlad.pillars.map((pillar) => ({
    id: pillar.id,
    name: pillar.name,
    color: pillar.color,
    archived: pillar.archivedAt !== null,
    lessons: pillar.lessons,
    minutes: pillar.minutes,
    withoutEstimate: pillar.withoutEstimate,
    looseLessons: pillar.looseLessons,
    skills: pillar.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      note: skill.note,
      archived: skill.archivedAt !== null,
      rank: skill.rank,
      reached: skill.reached,
      lessons: skill.lessons,
      lessonsTotal: skill.lessonsTotal,
      minutes: skill.minutes,
      daysSince: skill.daysSince,
      quiet: skill.quiet,
      tempoDays: skill.tempoDays,
      milestones: skill.milestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        /* Cez hranicu servera ide reťazec — klient z toho aj tak len číta,
           či je míľnik dosiahnutý, a dátum nikde nevykresľuje. */
        reachedAt: milestone.reachedAt === null ? null : milestone.reachedAt.toISOString(),
        evidence: milestone.evidence,
      })),
    })),
  }));

  const meta =
    prehlad.lessons === 0
      ? `žiadna lekcia za ${OKNO_DNI} dní`
      : `${countSk(prehlad.lessons, "lekcia", "lekcie", "lekcií")} za ${OKNO_DNI} dní` +
        (prehlad.minutes > 0 ? ` · ${formatDuration(prehlad.minutes)}` : "");

  return (
    <div className="flex w-full flex-col md:h-dvh">
      <ScreenHeader title="Učenie" meta={meta} />

      <p className="shrink-0 border-b border-border px-5 py-[11px] text-pretty text-body leading-normal text-fg-muted">
        Lekcia je <span className="font-medium text-fg">dokončená úloha</span>,
        ktorej si dal pilier — nezapisuje sa sem druhýkrát. Postup drží míľnik,
        teda overiteľná veta, nie číslo úrovne, a séria je kĺzavé okno, takže
        sa nedá zlomiť jedným zlým týždňom.
      </p>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <LearningBoard pillars={pillars} windowDays={OKNO_DNI} />
      </div>

      <ScreenFooter
        summary={countSk(
          pillars.filter((pillar) => !pillar.archived).length,
          "pilier",
          "piliere",
          "pilierov",
        )}
      />
    </div>
  );
}
