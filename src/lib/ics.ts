/**
 * Čítanie kalendárneho odberu (ICS) z EduPage.
 *
 * Čistá funkcia nad textom — bez siete a bez databázy, aby sa dala otestovať
 * na skutočnom súbore. Sťahovanie je inde; sem príde hotový reťazec.
 *
 * ## Čo v tom feede naozaj je
 *
 * Overené na odbere zo `gmet.edupage.org` (31. 8. 2026, 560 udalostí na tri
 * mesiace dopredu). Každá hodina je **vypísaná na konkrétny dátum**, nie ako
 * opakujúce sa pravidlo — vďaka tomu sa dá uložiť riadok na deň a suplovanie
 * potom nie je zvláštny prípad, ale zmenený riadok.
 *
 * ```
 * BEGIN:VEVENT
 * UID:2026-09-02:6bb02a0f_3@gmet.edupage.org
 * DTSTART:20260902T075000Z
 * DTEND:20260902T083500Z
 * SUMMARY:SJL
 * LOCATION:sep b
 * DESCRIPTION:sepB\nBEU
 * END:VEVENT
 * ```
 *
 * - `SUMMARY` je **skratka** predmetu, nie celý názov. Celé názvy vo feede
 *   nie sú vôbec — dopĺňajú sa ručne.
 * - `DESCRIPTION` je skupina a skratka vyučujúceho, oddelené `\n` — a to
 *   **doslovnými znakmi spätná lomka a `n`**, nie koncom riadku. ICS si takto
 *   escapuje text a je to najľahšia vec, na ktorej sa dá pomýliť.
 * - Číslo za podčiarkovníkom v `UID` je **poradie hodiny** (1.–7.).
 * - Časy sú v **UTC** (`Z` na konci). 07:50Z je 09:50 stredoeurópskeho letného
 *   času — kto to vezme ako miestny čas, posunie celý rozvrh o dve hodiny.
 *   Prevod robí volajúci cez `minutesIn`/`todayIn`, ktoré poznajú pásmo
 *   používateľa.
 *
 * ## Suplovanie TAM JE — ako šípka v `SUMMARY`
 *
 * `SUMMARY:DEJ -> SJL` znamená „namiesto dejepisu je slovenčina". Zistilo sa
 * to až na živých dátach: odber z 31. 8. nemal šípku ani raz, ten z 2. 9. ju
 * mal. Kto ju nerozdelí, vyrobí predmet so skratkou `DEJ -> SJL` — a takých
 * pribudne jeden za každú novú dvojicu, kým sa zoznam predmetov nezaplní
 * odpadom.
 *
 * ## Čo vo feede NIE JE
 *
 * **Prázdniny a sviatky.** Dokázané tým, že 15. 9. aj 17. 11. 2026 sú štátne
 * sviatky a feed na nich má plných osem hodín. Suplovanie a voľná sú teda dve
 * rôzne veci: prvé zdroj dodáva, druhé nie.
 */

/** Jedna hodina tak, ako ju vydal kalendár. Časy sú okamihy v UTC. */
export interface IcsLesson {
  /** Pôvodný `UID`. Slúži na spárovanie pri opakovanom importe. */
  uid: string;
  start: Date;
  end: Date;
  /** Skratka predmetu zo `SUMMARY`, napr. `ANJ`. Pri suplovaní ten NOVÝ. */
  subject: string;
  /**
   * Pri suplovaní skratka predmetu, ktorý tu mal byť podľa rozvrhu.
   * `null` pri bežnej hodine.
   */
  originalSubject: string | null;
  /** Učebňa z `LOCATION`. Prázdny reťazec, keď chýba. */
  room: string;
  /** Skupina z prvého riadku `DESCRIPTION`, napr. `sepB j1.sk`. */
  group: string;
  /** Skratka vyučujúceho z druhého riadku `DESCRIPTION`, napr. `LIN`. */
  teacher: string;
  /** Poradie hodiny z `UID`; `null`, keď sa nedá prečítať. */
  period: number | null;
}

/**
 * Rozbalí zalomené riadky.
 *
 * ICS láme dlhé riadky na 75 znakov a pokračovanie začína medzerou alebo
 * tabulátorom. Kto to nespojí, dostane názov učebne roztrhnutý napoly.
 */
function spojRiadky(text: string): string[] {
  const riadky: string[] = [];

  for (const surovy of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if ((surovy.startsWith(" ") || surovy.startsWith("\t")) && riadky.length > 0) {
      riadky[riadky.length - 1] += surovy.slice(1);
      continue;
    }
    riadky.push(surovy);
  }

  return riadky;
}

/**
 * Odstráni escapovanie textu podľa RFC 5545.
 *
 * `\n` je nový riadok, `\,` čiarka, `\;` bodkočiarka, `\\` spätná lomka.
 * Poradie je dôležité: keby sa `\\` riešilo ako prvé, z `\\n` by vznikol
 * nový riadok namiesto spätnej lomky a písmena.
 */
function odescapuj(hodnota: string): string {
  let vysledok = "";

  for (let i = 0; i < hodnota.length; i++) {
    if (hodnota[i] !== "\\" || i + 1 >= hodnota.length) {
      vysledok += hodnota[i];
      continue;
    }

    const dalsi = hodnota[i + 1];
    i += 1;
    if (dalsi === "n" || dalsi === "N") vysledok += "\n";
    else if (dalsi === "\\" || dalsi === "," || dalsi === ";") vysledok += dalsi;
    else vysledok += dalsi;
  }

  return vysledok;
}

/**
 * `20260902T075000Z` → okamih.
 *
 * Berie sa len tvar s `Z`, teda UTC — presne to, čo EduPage posiela. Tvar
 * bez pásma by sa musel vykladať podľa `TZID` a hádať pri ňom by znamenalo
 * posunúť celý rozvrh; radšej takú udalosť preskočiť než ju umiestniť zle.
 */
function citajCas(hodnota: string): Date | null {
  const zhoda = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(hodnota.trim());
  if (zhoda === null) return null;

  const [, rok, mesiac, den, hod, min, sek] = zhoda;
  const cas = Date.UTC(
    Number(rok),
    Number(mesiac) - 1,
    Number(den),
    Number(hod),
    Number(min),
    Number(sek),
  );
  return Number.isNaN(cas) ? null : new Date(cas);
}

/**
 * `DEJ -> SJL` → pôvodný a nový predmet.
 *
 * Šípka je jediné, čo o suplovaní vo feede je. Delí sa len vtedy, keď sú OBE
 * strany neprázdne — `-> SJL` alebo `DEJ ->` je pokazený údaj a je lepšie ho
 * nechať tak, ako je, než si domyslieť polovicu.
 *
 * Medzery okolo šípky sú voliteľné, lebo jeden jediný odber nestačí na to,
 * aby sa tvrdilo, že ich EduPage píše vždy rovnako.
 */
function rozdelSuplovanie(summary: string): {
  subject: string;
  originalSubject: string | null;
} {
  const zhoda = /^(.+?)\s*->\s*(.+)$/.exec(summary);
  if (zhoda === null) return { subject: summary, originalSubject: null };

  const povodny = zhoda[1]?.trim() ?? "";
  const novy = zhoda[2]?.trim() ?? "";
  if (povodny === "" || novy === "") {
    return { subject: summary, originalSubject: null };
  }

  return { subject: novy, originalSubject: povodny };
}

/** Poradie hodiny z `UID` tvaru `2026-09-02:6bb02a0f_3@skola.edupage.org`. */
function citajPoradie(uid: string): number | null {
  const zhoda = /_(\d+)@/.exec(uid);
  if (zhoda === null) return null;
  const cislo = Number(zhoda[1]);
  return Number.isInteger(cislo) && cislo > 0 ? cislo : null;
}

/**
 * Prečíta celý odber a vráti hodiny zoradené podľa začiatku.
 *
 * Udalosť bez začiatku, konca alebo predmetu sa **ticho preskočí**. Feed je
 * cudzí a môže sa kedykoľvek zmeniť; jedna pokazená udalosť nesmie zhodiť
 * celý import a nechať človeka bez rozvrhu.
 */
export function parseIcs(text: string): IcsLesson[] {
  const hodiny: IcsLesson[] = [];
  let aktualna: Record<string, string> | null = null;

  for (const riadok of spojRiadky(text)) {
    if (riadok === "BEGIN:VEVENT") {
      aktualna = {};
      continue;
    }

    if (riadok === "END:VEVENT") {
      if (aktualna !== null) {
        const hodina = zloz(aktualna);
        if (hodina !== null) hodiny.push(hodina);
      }
      aktualna = null;
      continue;
    }

    if (aktualna === null) continue;

    const dvojbodka = riadok.indexOf(":");
    if (dvojbodka < 0) continue;

    /* `DTSTART;TZID=Europe/Bratislava` — parametre za bodkočiarkou nezaujímajú. */
    const kluc = riadok.slice(0, dvojbodka).split(";")[0]?.toUpperCase() ?? "";
    aktualna[kluc] = riadok.slice(dvojbodka + 1);
  }

  return hodiny.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function zloz(polia: Record<string, string>): IcsLesson | null {
  const start = citajCas(polia.DTSTART ?? "");
  const end = citajCas(polia.DTEND ?? "");
  const summary = odescapuj(polia.SUMMARY ?? "").trim();

  if (start === null || end === null || summary === "") return null;
  /* Koniec pred začiatkom je pokazený údaj, nie hodina cez polnoc. */
  if (end.getTime() <= start.getTime()) return null;

  const popis = odescapuj(polia.DESCRIPTION ?? "").split("\n");
  const uid = polia.UID ?? "";
  const { subject, originalSubject } = rozdelSuplovanie(summary);

  return {
    uid,
    start,
    end,
    subject,
    originalSubject,
    room: odescapuj(polia.LOCATION ?? "").trim(),
    group: (popis[0] ?? "").trim(),
    teacher: (popis[1] ?? "").trim(),
    period: citajPoradie(uid),
  };
}

/**
 * Skupiny, ktoré sa v odbere vyskytujú.
 *
 * Odber je **celej triedy**, nie jedného žiaka: v odbere z `gmet` malo 153
 * okienok zo 407 dve hodiny naraz (delené jazyky, laboratóriá, telesná).
 */
export function groupsInFeed(hodiny: readonly IcsLesson[]): string[] {
  return [...new Set(hodiny.map((h) => h.group).filter((g) => g !== ""))].sort();
}

/** Okienko, v ktorom hodina leží. Dve hodiny v jednom okienku = delenie. */
function okienko(h: IcsLesson): string {
  return `${h.start.getTime()}`;
}

/**
 * Skupiny, medzi ktorými sa naozaj vyberá.
 *
 * Toto je celý vtip filtrovania. V odbere sú dva druhy skupín a vyzerajú
 * rovnako:
 *
 * - **`sepB`** — celá trieda. Keď má trieda dejepis, je v tom okienku sama.
 * - **`sepB j1.sk` / `sepB j2.sk`** — delenie. V jednom okienku stoja obe
 *   a človek chodí práve na jednu.
 *
 * Rozoznajú sa podľa toho, či sa v niektorom okienku stretnú s inou skupinou
 * — nie podľa názvu. Podľa názvu by to bolo hádanie: `sepB Chlapci` sa síce
 * začína na `sepB`, ale `lab 1.sk` už nie a ďalšia škola to bude písať inak.
 *
 * Vďaka tomu sa človeka pýtame **len na skutočné voľby**: pri odbere z `gmet`
 * na tri dvojice namiesto siedmich skupín.
 */
export function competingGroups(hodiny: readonly IcsLesson[]): string[] {
  const podlaOkienka = new Map<string, Set<string>>();

  for (const h of hodiny) {
    const kluc = okienko(h);
    const skupiny = podlaOkienka.get(kluc) ?? new Set<string>();
    skupiny.add(h.group);
    podlaOkienka.set(kluc, skupiny);
  }

  const delene = new Set<string>();
  for (const skupiny of podlaOkienka.values()) {
    if (skupiny.size > 1) for (const g of skupiny) delene.add(g);
  }

  return [...delene].filter((g) => g !== "").sort();
}

/**
 * Nechá len hodiny, na ktoré človek naozaj chodí.
 *
 * Hodina prejde, keď je jej skupina vybraná — alebo keď sa **o nič
 * nedelí**. To druhé je dôležité: celotriedne hodiny (`sepB`) by inak
 * vypadli, hoci na ne chodia všetci, a človek by musel medzi „svoje
 * skupiny" tikať aj vlastnú triedu.
 *
 * Prázdny výber znamená „ešte som nevyberal" a vráti všetko — je lepšie
 * ukázať rozvrh s dvojitými okienkami a vypýtať si výber, než ticho schovať
 * polovicu hodín.
 */
export function filterByGroups(
  hodiny: readonly IcsLesson[],
  moje: readonly string[],
): IcsLesson[] {
  if (moje.length === 0) return [...hodiny];

  const vyber = new Set(moje);
  const delene = new Set(competingGroups(hodiny));

  return hodiny.filter((h) => !delene.has(h.group) || vyber.has(h.group));
}
