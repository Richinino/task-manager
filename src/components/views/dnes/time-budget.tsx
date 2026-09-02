"use client";

import { formatDuration } from "@/lib/dates";
import { taskCountSk } from "@/lib/sk";
import { cn } from "@/lib/utils";

export interface TimeBudgetProps {
  /** Súčet odhadov dnešných nedokončených úloh, v minútach. */
  plannedMin: number;
  /**
   * Koľko minút má deň k dispozícii.
   *
   * Komponent si to zámerne nepočíta sám. Ranné plánovanie sem posiela CELÉ
   * okno dňa (plánuje sa celý deň), obrazovka „Dnes" cez `LiveTimeBudget`
   * len to, čo z neho ešte zostáva. Sú to dve rôzne otázky a jedno číslo by
   * na obe odpovedalo zle.
   */
  availableMin: number;
  /**
   * Je v dni celodenná úloha?
   *
   * Vtedy sa rozpočet neráta, ale oznamuje: deň je zabraný. Aritmetika by
   * tam hlásila „naplánoval si o 9 h viac, než máš“, čo nie je pravda —
   * človek deň nepreplánoval, len ho celý vyhradil na jednu vec.
   */
  allDay?: boolean;
  /** Koľko dnešných nedokončených úloh nemá odhad — číslo je o ne neúplné. */
  withoutEstimate: number;
  /**
   * Minúty, ktoré si z dňa berú porady z kalendára. Predvolene nula, lebo
   * kalendár je doplnok — rozpočet musí dávať zmysel aj bez pripojeného účtu.
   */
  meetingMin?: number;
  /**
   * Minúty, ktoré si z dňa ešte vezme škola.
   *
   * Musí to byť ZVYŠOK školy, nie celá — `remainingSchoolMinutes`, nie
   * `schoolMinutes`. Dostupný čas sa už počíta od teraz, takže hodiny, ktoré
   * prebehli, z neho vypadli samy; celá škola by dopoludnie odrátala druhý raz.
   *
   * Vlastné číslo, nie prihodené k poradám: veta musí znieť „škola 3 h",
   * lebo školu na rozdiel od porady nemôžeš presunúť ani zrušiť.
   */
  schoolMin?: number;
}

/**
 * Rozpočet času dňa. Tenký pruh a jedna veta — nič viac.
 *
 * Pri prekročení sa pruh aj text prefarbia na `text-danger` a pribudne veta
 * s rozdielom. Úlohy bez odhadu a porady sa priznávajú zvlášť, aby bolo jasné,
 * že súčet je spodný odhad, nie celá pravda, a odkiaľ sa vzal dostupný čas.
 */
export function TimeBudget({
  plannedMin,
  availableMin,
  allDay = false,
  withoutEstimate,
  meetingMin = 0,
  schoolMin = 0,
}: TimeBudgetProps) {
  const missing = withoutEstimate > 0 ? `${taskCountSk(withoutEstimate)} bez odhadu` : null;

  /*
    Porady sa od dostupného času ODPOČÍTAVAJÚ, nepripočítavajú sa
    k naplánovanému. Dvojhodinová porada neznamená dve hodiny práce navyše,
    ale dve hodiny, ktoré na prácu nezostali. Keby sa rátala ako naplánovaná
    práca, pruh by narástol rovnako, ale rozpočet by tvrdil, že na úlohy je
    stále celý deň — a človek by si podľa toho nabral prácu, na ktorú
    už nemá kedy siahnuť.
  */
  const meetings = Math.max(0, Math.round(meetingMin));
  /* Škola sa odpočítava z rovnakého dôvodu ako porady — len sa nedá presunúť. */
  const skola = Math.max(0, Math.round(schoolMin));
  const workMin = availableMin - meetings - skola;

  /*
    Na prácu nemusí zostať nič z dvoch celkom rôznych dôvodov: buď hodiny dňa
    v nastaveniach nedávajú žiadny čas (koniec ≤ začiatok), alebo sú hodiny
    v poriadku a do posledného ich zjedli porady. Pruh v oboch prípadoch nemá
    čo kresliť, ale rada musí sedieť na ten správny dôvod — posielať človeka
    do nastavení kvôli plnému kalendáru by bola len ďalšia stratená minúta.
  */
  if (workMin <= 0) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-body leading-relaxed text-fg-muted sm:text-xs">
          Naplánovaných{" "}
          <span className="font-mono tabular-nums">{formatDuration(plannedMin)}</span>.{" "}
          {availableMin <= 0 ? (
            "Rozpočet času sa nedá spočítať — hodiny dňa v nastaveniach nedávajú žiadny čas."
          ) : (
            <>
              Na prácu neostáva nič — celý deň zaberajú porady (
              <span className="font-mono tabular-nums">{formatDuration(meetings)}</span>).
            </>
          )}
        </p>
        {missing ? (
          <p className="text-body text-fg-subtle sm:text-xs">{missing}.</p>
        ) : null}
      </div>
    );
  }

  if (allDay) {
    return (
      <p className="text-body leading-relaxed text-fg-muted sm:text-xs">
        <span className="font-medium text-fg">Deň je zabraný celodennou úlohou.</span>{" "}
        Rozpočet sa neráta — na nič iné dnes miesto nie je.
      </p>
    );
  }

  const over = plannedMin > workMin;
  const overBy = plannedMin - workMin;
  const fill = Math.min(100, Math.round((plannedMin / workMin) * 100));

  return (
    <div className="flex flex-col gap-1.5">
      {/* Pruh je len obraz vety pod ním — pre čítačky ho neopakujeme. */}
      <div
        aria-hidden="true"
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          style={{ width: `${fill}%` }}
          className={cn("h-full rounded-full", over ? "bg-danger" : "bg-accent")}
        />
      </div>

      {/*
        Rozpis, kam sa deň delí. Pruh povie KOĽKO je zabraté, toto povie ČÍM —
        a to je rozdiel, ktorý mení rozhodnutie: osem hodín zabratých prácou
        sa dá presunúť, osem hodín zabratých poradami nie.

        Až od `sm:`. Na 375 px je pod pruhom veta a tretí riadok čísel by
        z rozpočtu spravil tabuľku práve tam, kde má byť jeden pohľad.
        Skryté aj pre čítačku — všetky tri čísla sú vo vete pod tým.
      */}
      <p
        aria-hidden="true"
        className="hidden items-center gap-2 font-mono text-mini tabular-nums text-fg-subtle sm:flex"
      >
        <span className={over ? "text-danger" : undefined}>
          úlohy {formatDuration(plannedMin)}
        </span>
        {meetings > 0 ? <span>· porady {formatDuration(meetings)}</span> : null}
        {!over ? <span>· voľné {formatDuration(workMin - plannedMin)}</span> : null}
      </p>

      {/*
        Na 375 px je celá veta („4 h 30 min naplánovaných z 8 h — naplánoval
        si o 1 h viac, než máš.") na tri riadky. Pod `sm:` preto vypadávajú
        len výplňové slová: ostáva „4 h 30 min z 8 h — o 1 h viac, než máš."
        Varovanie pri prekročení sa neskracuje nikdy — mení sa len jeho úvod,
        nie údaj ani červená farba.

        Porady dostávajú vlastnú vetu a nie zátvorku pri hodinách dňa: číslo
        „z 8 h" je už o ne znížené, takže akékoľvek „z toho" by pri ňom klamalo.
        Takto je vidieť aj to, kam sa podeli hodiny, ktoré v rozpočte chýbajú.
        Aj z tejto vety vypadáva pod `sm:` iba výplň („z dňa"); podmet aj sloveso
        ostávajú, lebo skratka bez nich („2 h porady") nie je slovenská veta.
      */}
      <p
        className={cn(
          "text-body leading-relaxed sm:text-xs",
          over ? "text-danger" : "text-fg-muted",
        )}
      >
        <span className="font-mono tabular-nums">{formatDuration(plannedMin)}</span>{" "}
        <span className="hidden sm:inline">naplánovaných </span>z{" "}
        <span className="font-mono tabular-nums">{formatDuration(workMin)}</span>
        {over ? (
          <>
            {" — "}
            <span className="hidden sm:inline">naplánoval si </span>o{" "}
            <span className="font-mono tabular-nums">{formatDuration(overBy)}</span> viac, než
            máš.
          </>
        ) : (
          "."
        )}
        {meetings > 0 ? (
          <>
            {" "}
            Porady ubrali <span className="hidden sm:inline">z dňa </span>
            <span className="font-mono tabular-nums">{formatDuration(meetings)}</span>.
          </>
        ) : null}
      </p>

      {missing ? (
        <p className="text-body text-fg-subtle sm:text-xs">
          {missing} — skutočný čas bude vyšší.
        </p>
      ) : null}
    </div>
  );
}
