import { buildAssetLinks } from "@/lib/assetlinks";

/**
 * `/.well-known/assetlinks.json` — dôkaz, že appka na Androide a táto
 * stránka patria k sebe.
 *
 * Bez neho sa `.apk` postavené cez TWA otvorí s adresným riadkom navrchu,
 * teda ako prehliadač s cudzou stránkou.
 *
 * **Prečo to nie je súbor v `public/`:** odtlačok podpisového kľúča nepatrí
 * do repozitára a pri Play App Signing sa navyše po nasadení zmení. Ako
 * premenná prostredia sa dá vymeniť bez zásahu do kódu.
 *
 * **Prečo `/api/assetlinks` a nie priečinok `.well-known`:** Next si
 * priečinky začínajúce bodkou v `app/` nevšíma. Skutočnú cestu dopĺňa
 * prepis v `next.config.ts` — Android chodí výhradne na
 * `/.well-known/assetlinks.json` a nič iné neakceptuje.
 *
 * Cesta je zámerne verejná: overenie robí systém Androidu bez prihlásenia.
 * Nič tajné v odpovedi nie je — odtlačok verejného certifikátu si vie
 * ktokoľvek prečítať priamo z nainštalovanej appky.
 */

/** Premenné sa čítajú za behu, takže výmena nevyžaduje nový build. */
export const dynamic = "force-dynamic";

export function GET(): Response {
  const statements = buildAssetLinks({
    packageName: process.env.ANDROID_PACKAGE_NAME,
    fingerprints: process.env.ANDROID_CERT_FINGERPRINTS,
  });

  /*
    Kým premenné nie sú nastavené, cesta neexistuje.

    Prázdne vyhlásenie by bolo horšie než chýbajúci súbor: Android by ho
    stiahol, nenašiel by v ňom svoj kľúč a overenie by skončilo neúspechom
    namiesto toho, aby sa naň dalo počkať.
  */
  if (statements === null) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return Response.json(statements, {
    headers: {
      // Android si súbor sťahuje sám a znova. Hodina je dosť na to, aby
      // zmena odtlačku nečakala do večera, a málo na to, aby to zaťažilo.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
