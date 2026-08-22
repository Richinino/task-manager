import { describe, expect, it } from "vitest";

import { buildAssetLinks, isValidPackageName, parseFingerprints } from "./assetlinks";

/** Platný odtlačok na skúšanie — 32 bajtov. */
const A = Array.from({ length: 32 }, (_, i) =>
  i.toString(16).padStart(2, "0").toUpperCase(),
).join(":");
const B = Array.from({ length: 32 }, () => "FF").join(":");

describe("parseFingerprints", () => {
  it("prijme jeden odtlačok", () => {
    expect(parseFingerprints(A)).toEqual([A]);
  });

  it("oddeľovač je čiarka, medzera aj nový riadok", () => {
    expect(parseFingerprints(`${A},${B}`)).toEqual([A, B]);
    expect(parseFingerprints(`${A} ${B}`)).toEqual([A, B]);
    expect(parseFingerprints(`${A}\n${B}`)).toEqual([A, B]);
    expect(parseFingerprints(`  ${A} ,\n  ${B}  `)).toEqual([A, B]);
  });

  it("zdvihne na veľké písmená — Google porovnáva presne", () => {
    expect(parseFingerprints(A.toLowerCase())).toEqual([A]);
  });

  it("duplicity vypadnú, poradie drží prvý výskyt", () => {
    expect(parseFingerprints(`${B},${A},${B}`)).toEqual([B, A]);
  });

  it("nezmysly sa zahodia, platné vedľa nich prejdú", () => {
    expect(parseFingerprints("")).toEqual([]);
    expect(parseFingerprints(undefined)).toEqual([]);
    expect(parseFingerprints("neodtlacok")).toEqual([]);
    expect(parseFingerprints(`kratky:AB, ${A}`)).toEqual([A]);
  });

  it("o jeden bajt kratší ani dlhší neprejde", () => {
    const kratky = A.split(":").slice(0, 31).join(":");
    expect(parseFingerprints(kratky)).toEqual([]);
    expect(parseFingerprints(`${A}:AB`)).toEqual([]);
  });

  it("iné oddeľovače než dvojbodka neprejdú", () => {
    expect(parseFingerprints(A.replace(/:/g, "-"))).toEqual([]);
    expect(parseFingerprints(A.replace(/:/g, ""))).toEqual([]);
  });

  it("znak mimo šestnástkovej sústavy neprejde", () => {
    expect(parseFingerprints(A.replace(/^00/, "0G"))).toEqual([]);
  });
});

describe("isValidPackageName", () => {
  it("prijme bežné tvary", () => {
    expect(isValidPackageName("com.richinino.taskmanazer")).toBe(true);
    expect(isValidPackageName("sk.a.b")).toBe(true);
    expect(isValidPackageName("com.example.my_app2")).toBe(true);
  });

  it("odmietne jediný segment", () => {
    expect(isValidPackageName("taskmanazer")).toBe(false);
  });

  it("segment nesmie začínať číslicou ani bodkou", () => {
    expect(isValidPackageName("com.2fast")).toBe(false);
    expect(isValidPackageName(".com.app")).toBe(false);
    expect(isValidPackageName("com.app.")).toBe(false);
    expect(isValidPackageName("com..app")).toBe(false);
  });

  it("odmietne pomlčku a medzeru", () => {
    expect(isValidPackageName("com.task-manazer")).toBe(false);
    expect(isValidPackageName("com.task manazer")).toBe(false);
  });

  it("prázdne a nezadané je nie", () => {
    expect(isValidPackageName("")).toBe(false);
    expect(isValidPackageName(undefined)).toBe(false);
  });
});

describe("buildAssetLinks", () => {
  it("postaví vyhlásenie v tvare, aký čaká Android", () => {
    const out = buildAssetLinks({ packageName: "com.example.app", fingerprints: A });
    expect(out).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.example.app",
          sha256_cert_fingerprints: [A],
        },
      },
    ]);
  });

  it("obalové medzery v názve balíka neprekážajú", () => {
    const out = buildAssetLinks({ packageName: "  com.example.app  ", fingerprints: A });
    expect(out?.[0]?.target.package_name).toBe("com.example.app");
  });

  /*
    Prázdny zoznam odtlačkov je horší než chýbajúci súbor: Android by ho
    stiahol, nenašiel by v ňom svoj kľúč a overenie by SKONČILO neúspechom
    namiesto toho, aby sa naň dalo počkať.
  */
  it("bez použiteľných údajov vráti null, nie prázdne vyhlásenie", () => {
    expect(buildAssetLinks({})).toBeNull();
    expect(buildAssetLinks({ packageName: "com.example.app" })).toBeNull();
    expect(buildAssetLinks({ packageName: "com.example.app", fingerprints: "  " })).toBeNull();
    expect(buildAssetLinks({ packageName: "com.example.app", fingerprints: "zle" })).toBeNull();
    expect(buildAssetLinks({ packageName: "zlybalik", fingerprints: A })).toBeNull();
  });

  it("unesie viac kľúčov naraz — ladiaci aj podpisový z Play", () => {
    const out = buildAssetLinks({ packageName: "com.example.app", fingerprints: `${A}\n${B}` });
    expect(out?.[0]?.target.sha256_cert_fingerprints).toEqual([A, B]);
  });
});
