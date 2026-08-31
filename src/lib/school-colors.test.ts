import { describe, expect, it } from "vitest";

import { AREA_COLOR_OPTIONS } from "@/components/views/oblasti/area-colors";

import { subjectColor } from "./school-colors";

/** Skratky z jeho skutočného rozvrhu (gmet.edupage.org). */
const JEHO_PREDMETY = [
  "ANJ",
  "BIO",
  "BIO lab",
  "CHE",
  "CHE lab",
  "DEJ",
  "FYZ",
  "GEG",
  "INF",
  "MAT",
  "NEJ",
  "OBN",
  "SJL",
  "TSV",
  "UKL",
];

describe("subjectColor", () => {
  it("známy predmet dostane svoju farbu", () => {
    expect(subjectColor("MAT")).toBe("blue");
    expect(subjectColor("TSV")).toBe("red");
  });

  /*
    Zdroj píše skratky, ako sa mu zachce — `BIO lab` s medzerou, iná škola
    môže písať malými. Farba sa nesmie stratiť na veľkosti písmen.
  */
  it("nezáleží na veľkosti písmen ani na medzerách okolo", () => {
    expect(subjectColor("bio lab")).toBe("lime");
    expect(subjectColor("  MAT  ")).toBe("blue");
  });

  /*
    Toto je celý dôvod, prečo je poradie ručne zvolené: v mriežke stoja
    predmety vedľa seba a dva rovnaké odtiene z nej spravia kašu.
  */
  it("celý jeho rozvrh dostane 15 rôznych farieb", () => {
    const farby = JEHO_PREDMETY.map((p) => subjectColor(p));
    expect(new Set(farby).size).toBe(JEHO_PREDMETY.length);
  });

  /*
    Farba mimo palety by v mriežke spadla na stlmenú neutrálnu a predmet by
    vyzeral ako vypnutý.
  */
  it("každá farba je z palety appky", () => {
    const paleta = new Set(AREA_COLOR_OPTIONS.map((o) => o.value));
    for (const predmet of JEHO_PREDMETY) {
      expect(paleta.has(subjectColor(predmet))).toBe(true);
    }
  });

  it("neznámy predmet dostane prvú voľnú farbu", () => {
    expect(subjectColor("RUJ")).toBe("sky");
    expect(subjectColor("RUJ", ["sky"])).toBe("amber");
  });

  /*
    Keď sa paleta minie, farba sa zopakuje. Opakovaná farba je menšie zlo než
    import, ktorý zlyhá na tom, že si nemá z čoho vybrať.
  */
  it("pri vyčerpanej palete radšej zopakuje než zlyhá", () => {
    const vsetky = AREA_COLOR_OPTIONS.map((o) => o.value);
    expect(typeof subjectColor("XYZ", vsetky)).toBe("string");
    expect(subjectColor("XYZ", vsetky)).not.toBe("");
  });
});
