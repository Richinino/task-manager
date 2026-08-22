/**
 * Digital Asset Links — dôkaz, že appka na Androide a táto stránka patria
 * k sebe.
 *
 * Bez neho sa `.apk` postavené cez TWA otvorí s adresným riadkom navrchu,
 * teda ako prehliadač s cudzou stránkou. Až keď Android stiahne
 * `/.well-known/assetlinks.json` a nájde v ňom odtlačok podpisového kľúča
 * appky, riadok zmizne a appka vyzerá ako appka. Overenie prebehne pri
 * inštalácii a potom občas znova — súbor teda musí byť dostupný trvalo.
 *
 * Hodnoty sa nedajú zapísať do repozitára: odtlačok vzniká až z podpisového
 * kľúča, ktorý drží ten, kto appku podpisuje. Preto sa čítajú z prostredia
 * a tento modul rieši len ich rozobratie a overenie.
 *
 * **Prečo sa neplatný vstup zahadzuje potichu a nie s výnimkou:** súbor
 * obsluhuje verejná cesta. Preklep v premennej nesmie zhodiť nasadenie —
 * má viesť k tomu, že sa odtlačok neponúkne, a appka teda ostane s adresným
 * riadkom. To je viditeľné, ale neškodné; spadnutá stránka nie je.
 */

/** Odtlačok SHA-256: 32 bajtov v šestnástkovej sústave, oddelené dvojbodkou. */
const ODTLACOK = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * Názov balíka Androidu: aspoň dva segmenty oddelené bodkou, každý začína
 * písmenom. Java tam pripúšťa aj podčiarkovník, číslice až od druhého znaku.
 */
const BALIK = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export interface AssetLinksTarget {
  namespace: "android_app";
  package_name: string;
  sha256_cert_fingerprints: string[];
}

export interface AssetLinksStatement {
  relation: ["delegate_permission/common.handle_all_urls"];
  target: AssetLinksTarget;
}

/**
 * Rozoberie zoznam odtlačkov.
 *
 * Oddeľovač je čiarka, medzera aj nový riadok — `keytool` ich vypisuje
 * po jednom na riadok a nikoho nebaví to prepisovať do jedného tvaru.
 * Malé písmená sa zdvihnú na veľké, lebo Google porovnáva presne.
 * Duplicity vypadnú; poradie ostáva podľa prvého výskytu.
 */
export function parseFingerprints(raw: string | undefined): string[] {
  if (raw === undefined) return [];

  const videne = new Set<string>();
  const out: string[] = [];

  for (const kus of raw.split(/[\s,]+/)) {
    const f = kus.trim().toUpperCase();
    if (f === "" || !ODTLACOK.test(f) || videne.has(f)) continue;
    videne.add(f);
    out.push(f);
  }

  return out;
}

/** Je to použiteľný názov balíka? */
export function isValidPackageName(name: string | undefined): boolean {
  if (name === undefined) return false;
  const trimmed = name.trim();
  // 255 je strop, ktorý znesie aj `PackageManager`; dlhší je určite preklep.
  return trimmed.length <= 255 && BALIK.test(trimmed);
}

/**
 * Postaví obsah `assetlinks.json`, alebo `null`, keď naň nie sú údaje.
 *
 * `null` znamená „tento súbor sa nemá zverejniť". Prázdny zoznam odtlačkov
 * by totiž bol horší než chýbajúci súbor: Android by ho stiahol, nenašiel
 * by v ňom svoj kľúč a overenie by skončilo neúspechom namiesto toho, aby
 * sa naň dalo počkať.
 */
export function buildAssetLinks(env: {
  packageName?: string;
  fingerprints?: string;
}): AssetLinksStatement[] | null {
  const packageName = env.packageName?.trim();
  if (!isValidPackageName(packageName)) return null;

  const sha256_cert_fingerprints = parseFingerprints(env.fingerprints);
  if (sha256_cert_fingerprints.length === 0) return null;

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        // `packageName` je tu už overený, TypeScript to z `isValidPackageName`
        // sám nevyčíta.
        package_name: packageName as string,
        sha256_cert_fingerprints,
      },
    },
  ];
}
