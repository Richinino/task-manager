import { describe, expect, it } from "vitest";

import {
  competingGroups,
  filterByGroups,
  groupsInFeed,
  parseIcs,
} from "./ics";

/*
  Ukážka je doslova z odberu `gmet.edupage.org` (31. 8. 2026) — vrátane toho,
  že `DESCRIPTION` nesie skupinu a vyučujúceho oddelených escapovaným `\n`
  a že časy sú v UTC.
*/
const FEED = [
  "BEGIN:VCALENDAR",
  "PRODID:-//aSc//Edupage//EN",
  "VERSION:2.0",
  "X-WR-CALNAME:Rozvrh: 5089303",
  "X-WR-TIMEZONE:Europe/Bratislava",
  "BEGIN:VEVENT",
  "UID:2026-09-07:6bb02a0f_1@gmet.edupage.org",
  "DTSTART:20260907T060000Z",
  "DTEND:20260907T064500Z",
  "SUMMARY:ANJ",
  "LOCATION:J2 (T)",
  "DESCRIPTION:sepB j1.sk\\nLIN",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:2026-09-07:85977977_1@gmet.edupage.org",
  "DTSTART:20260907T060000Z",
  "DTEND:20260907T064500Z",
  "SUMMARY:NEJ",
  "LOCATION:sep b",
  "DESCRIPTION:sepB j2.sk\\nMIE",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:2026-09-07:11111111_5@gmet.edupage.org",
  "DTSTART:20260907T095000Z",
  "DTEND:20260907T103500Z",
  "SUMMARY:DEJ",
  "LOCATION:U1 (T)",
  "DESCRIPTION:sepB\\nŠUT",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("parseIcs", () => {
  it("prečíta hodinu so všetkým, čo o nej feed vie", () => {
    const [prva] = parseIcs(FEED);
    expect(prva).toMatchObject({
      subject: "ANJ",
      room: "J2 (T)",
      group: "sepB j1.sk",
      teacher: "LIN",
      period: 1,
    });
    expect(prva?.start.toISOString()).toBe("2026-09-07T06:00:00.000Z");
    expect(prva?.end.toISOString()).toBe("2026-09-07T06:45:00.000Z");
  });

  /*
    Toto je tá najľahšia pasca celého feedu: `\n` v `DESCRIPTION` nie je
    koniec riadku, ale dva znaky — spätná lomka a `n`. Kto ich nerozbalí,
    dostane skupinu aj vyučujúceho zliatych do jedného reťazca.
  */
  it("rozbalí escapované `\\n` na skupinu a vyučujúceho", () => {
    const hodiny = parseIcs(FEED);
    expect(hodiny.map((h) => h.group)).toContain("sepB j2.sk");
    expect(hodiny.map((h) => h.teacher)).toContain("MIE");
    expect(hodiny.every((h) => !h.group.includes("\\"))).toBe(true);
  });

  it("zoradí hodiny podľa začiatku", () => {
    const casy = parseIcs(FEED).map((h) => h.start.getTime());
    expect(casy).toEqual([...casy].sort((a, b) => a - b));
  });

  /*
    ICS láme dlhé riadky na 75 znakov a pokračovanie začína medzerou. Bez
    spojenia by sa názov učebne roztrhol napoly.
  */
  it("spojí zalomený riadok", () => {
    const zalomeny = [
      "BEGIN:VEVENT",
      "UID:x_2@s.edupage.org",
      "DTSTART:20260907T060000Z",
      "DTEND:20260907T064500Z",
      "SUMMARY:MAT",
      "LOCATION:Veľmi dlhá učeb",
      " ňa číslo 209",
      "DESCRIPTION:sepB\\nREI",
      "END:VEVENT",
    ].join("\r\n");
    expect(parseIcs(zalomeny)[0]?.room).toBe("Veľmi dlhá učebňa číslo 209");
  });

  /*
    Feed je cudzí a môže sa kedykoľvek zmeniť. Jedna pokazená udalosť nesmie
    zhodiť import a nechať človeka bez rozvrhu — preskočí sa a zvyšok prejde.
  */
  it("pokazenú udalosť preskočí a zvyšok prečíta", () => {
    const pokazeny = [
      "BEGIN:VEVENT",
      "UID:a_1@s.edupage.org",
      "SUMMARY:Bez casu",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:b_2@s.edupage.org",
      "DTSTART:20260907T060000Z",
      "DTEND:20260907T064500Z",
      "SUMMARY:MAT",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:c_3@s.edupage.org",
      "DTSTART:20260907T060000Z",
      "DTEND:20260907T054500Z",
      "SUMMARY:Koniec pred zaciatkom",
      "END:VEVENT",
    ].join("\n");
    const hodiny = parseIcs(pokazeny);
    expect(hodiny).toHaveLength(1);
    expect(hodiny[0]?.subject).toBe("MAT");
  });

  it("z prázdneho textu nespraví hodinu", () => {
    expect(parseIcs("")).toEqual([]);
    expect(parseIcs("BEGIN:VCALENDAR\nEND:VCALENDAR")).toEqual([]);
  });

  /*
    Bez `Z` sa čas vykladá podľa `TZID` a hádať pri ňom by znamenalo posunúť
    celý rozvrh o hodiny. Radšej udalosť preskočiť než ju umiestniť zle.
  */
  it("čas bez pásma neberie", () => {
    const bezPasma = [
      "BEGIN:VEVENT",
      "UID:x_1@s.edupage.org",
      "DTSTART;TZID=Europe/Bratislava:20260907T080000",
      "DTEND;TZID=Europe/Bratislava:20260907T084500",
      "SUMMARY:MAT",
      "END:VEVENT",
    ].join("\n");
    expect(parseIcs(bezPasma)).toEqual([]);
  });

  it("znesie chýbajúcu učebňu aj popis", () => {
    const holy = [
      "BEGIN:VEVENT",
      "UID:x_4@s.edupage.org",
      "DTSTART:20260907T060000Z",
      "DTEND:20260907T064500Z",
      "SUMMARY:MAT",
      "END:VEVENT",
    ].join("\n");
    expect(parseIcs(holy)[0]).toMatchObject({
      room: "",
      group: "",
      teacher: "",
      period: 4,
    });
  });
});

describe("groupsInFeed", () => {
  it("vymenuje skupiny bez prázdnych a bez opakovania", () => {
    expect(groupsInFeed(parseIcs(FEED))).toEqual([
      "sepB",
      "sepB j1.sk",
      "sepB j2.sk",
    ]);
  });
});

describe("competingGroups", () => {
  /*
    Toto je jadro celého filtrovania. `sepB` je celá trieda a v okienku stojí
    sama; `sepB j1.sk` a `sepB j2.sk` stoja v jednom okienku oproti sebe.
    Rozoznať sa to musí podľa okienok, nie podľa názvu — `sepB Chlapci` sa
    síce začína na `sepB`, ale `lab 1.sk` už nie.
  */
  it("nájde len tie skupiny, medzi ktorými sa vyberá", () => {
    expect(competingGroups(parseIcs(FEED))).toEqual(["sepB j1.sk", "sepB j2.sk"]);
  });

  it("keď sa nič nedelí, netreba sa na nič pýtať", () => {
    const bezDelenia = parseIcs(FEED).filter((h) => h.group === "sepB");
    expect(competingGroups(bezDelenia)).toEqual([]);
  });
});

describe("filterByGroups", () => {
  const hodiny = parseIcs(FEED);

  /*
    Odber je celej triedy. V skutočnom feede malo 153 okienok zo 407 dve
    hodiny naraz — bez filtra by mal človek v pondelok jedenásť hodín
    namiesto šiestich a škola by mu rozpočet dňa zožrala dvakrát.
  */
  it("nechá vybranú skupinu a zahodí tú druhú", () => {
    const moje = filterByGroups(hodiny, ["sepB j1.sk"]);
    expect(moje.map((h) => h.subject).sort()).toEqual(["ANJ", "DEJ"]);
  });

  /*
    Celotriedna hodina prejde bez toho, aby si človek medzi „svoje skupiny"
    tikal aj vlastnú triedu. Inak by bol výber otázka, ktorá má jedinú
    rozumnú odpoveď — a to nie je otázka.
  */
  it("celotriednu hodinu nechá aj bez tikania", () => {
    const moje = filterByGroups(hodiny, ["sepB j2.sk"]);
    expect(moje.map((h) => h.subject).sort()).toEqual(["DEJ", "NEJ"]);
  });

  /*
    Prázdny výber znamená „ešte som nevyberal". Ticho schovať polovicu hodín
    by bolo horšie než ukázať dvojité okienka a vypýtať si výber.
  */
  it("bez výberu vráti všetko", () => {
    expect(filterByGroups(hodiny, [])).toHaveLength(hodiny.length);
  });

  it("neznámu skupinu vo výbere znesie a delené zahodí", () => {
    const moje = filterByGroups(hodiny, ["sepB nic-take"]);
    expect(moje.map((h) => h.subject)).toEqual(["DEJ"]);
  });
});

describe("suplovanie v SUMMARY", () => {
  /*
    Toto sa zistilo až na živých dátach. Odber z 31. 8. nemal šípku ani raz,
    ten z 2. 9. mal `DEJ -> SJL`. Bez rozdelenia vznikne predmet so skratkou
    „DEJ -> SJL" a takých pribudne jeden za každú novú dvojicu, kým sa zoznam
    predmetov nezaplní odpadom.
  */
  function jedna(summary: string) {
    return parseIcs(
      [
        "BEGIN:VEVENT",
        "UID:x_3@s.edupage.org",
        "DTSTART:20260902T075000Z",
        "DTEND:20260902T083500Z",
        `SUMMARY:${summary}`,
        "DESCRIPTION:sepB\nBEU",
        "END:VEVENT",
      ].join("\n"),
    )[0];
  }

  it("rozdelí `DEJ -> SJL` na nový a pôvodný predmet", () => {
    expect(jedna("DEJ -> SJL")).toMatchObject({
      subject: "SJL",
      originalSubject: "DEJ",
    });
  });

  it("bežná hodina pôvodný predmet nemá", () => {
    expect(jedna("SJL")).toMatchObject({ subject: "SJL", originalSubject: null });
  });

  /* Jeden odber nestačí na tvrdenie, že medzery píše EduPage vždy rovnako. */
  it("znesie šípku bez medzier aj s viacerými", () => {
    expect(jedna("DEJ->SJL")?.subject).toBe("SJL");
    expect(jedna("DEJ   ->   SJL")?.originalSubject).toBe("DEJ");
  });

  it("viacslovné skratky sa neroztrhnú", () => {
    expect(jedna("BIO lab -> CHE lab")).toMatchObject({
      subject: "CHE lab",
      originalSubject: "BIO lab",
    });
  });

  /*
    Polovičný údaj sa nechá tak, ako prišiel. Domyslieť si chýbajúcu stranu by
    znamenalo vyrobiť suplovanie, ktoré zdroj nikdy nepovedal.
  */
  it("polovičnú šípku nechá na pokoji", () => {
    expect(jedna("-> SJL")).toMatchObject({
      subject: "-> SJL",
      originalSubject: null,
    });
    expect(jedna("DEJ ->")).toMatchObject({
      subject: "DEJ ->",
      originalSubject: null,
    });
  });
});
