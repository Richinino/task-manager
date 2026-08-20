/**
 * Miesta a vzdialenosti.
 *
 * Spája kontext (`@domino`) s bodom na mape, aby appka po stlačení „som tu"
 * vedela povedať, kde si — a ponúknuť úlohy práve pre to miesto.
 *
 * Čistá funkcia. Súradnice prichádzajú zvonku; táto vrstva sa prehliadača
 * nikdy nepýta.
 */

export interface Place {
  /** Kontext bez `@`. */
  context: string;
  /**
   * Adresa tak, ako ju človek napísal — `Trnavská cesta 100, Bratislava`.
   *
   * Toto je to, čo sa zadáva a vidí; súradnice sú z nej **odvodené** a nikto
   * ich neprepisuje ručne. Chýba len pri miestach zadaných ešte súradnicami,
   * a vtedy sa v nastaveniach vypíšu naspäť tie.
   *
   * Prečo sa aj tak ukladajú súradnice: prehliadač o polohe povie zemepisnú
   * šírku a dĺžku, nie adresu. Porovnať „kde som" s „kde je Domino" sa teda
   * bez čísel nedá a preklad adresy na body musí prebehnúť raz pri uložení.
   */
  address?: string;
  lat: number;
  lon: number;
}

/**
 * Jeden riadok z nastavení, ešte nepreložený na súradnice.
 *
 * `query` môže byť adresa aj dvojica čísel — rozhodne sa až o krok ďalej,
 * lebo preklad adresy potrebuje sieť a tá do tejto vrstvy nepatrí.
 */
export interface PlaceEntry {
  context: string;
  query: string;
}

export interface NearestPlace {
  place: Place;
  /** Vzdialenosť v metroch, zaokrúhlená. */
  meters: number;
}

const EARTH_RADIUS_M = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Vzdialenosť dvoch bodov v metroch — haversine.
 *
 * Guľa, nie elipsoid: rozdiel oproti presnému výpočtu je do pol percenta,
 * čo je pri otázke „som pri Domine?" úplne bez významu. Zato sa to zmestí do
 * desiatich riadkov a nepotrebuje knižnicu.
 *
 * Naivné odčítanie stupňov by nestačilo — stupeň zemepisnej dĺžky je pri póle
 * mnohonásobne kratší než na rovníku a najbližšie miesto by vychádzalo zle.
 */
export function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/**
 * Najbližšie miesto k danej polohe, alebo `null`.
 *
 * `maxMeters` je poistka proti nezmyslu: keď je najbližšie miesto tristo
 * kilometrov ďaleko, správna odpoveď je „nie si pri ničom", nie „si v Domine".
 * Pol kilometra je dosť na nepresnosť mestskej GPS a málo na to, aby sa
 * pomýlili dve miesta v tom istom meste.
 */
export function nearestPlace(
  position: { lat: number; lon: number },
  places: readonly Place[],
  maxMeters = 500,
): NearestPlace | null {
  let best: NearestPlace | null = null;

  for (const place of places) {
    const meters = distanceMeters(position, place);
    if (meters > maxMeters) continue;
    if (best === null || meters < best.meters) best = { place, meters };
  }

  return best;
}

/** „120 m" · „1,4 km" — na meter presne to nikoho nezaujíma. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREVOD NA TEXT A SPÄŤ

   Miesta sa v nastaveniach zadávajú ako text, riadok na miesto:

       domino = Trnavská cesta 100, Bratislava

   Súradnice sa píšu len výnimočne — kto ich má, môže:

       domino = 48.1445, 17.1102

   Rovnaký vzor ako pri pravidlách automatických štítkov — a rovnako patrí do
   knižnice, nie do komponentu: sú to čisté funkcie a práve tu vzniká najviac
   chýb, okolo desatinnej čiarky a rozpísaného riadku.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Vypíše miesta späť do textu.
 *
 * Prednosť má adresa: práve ju človek napísal a práve ju chce vidieť. Miesta
 * uložené ešte pred adresami adresu nemajú, tie sa vypíšu súradnicami — inak
 * by sa po prvom otvorení nastavení ticho zmenili na niečo iné.
 */
export function placesToText(places: readonly Place[]): string {
  return places
    .map((place) => {
      const right = place.address ?? `${place.lat}, ${place.lon}`;
      return `${place.context} = ${right}`;
    })
    .join("\n");
}

/**
 * Rozdelí text na riadky `kontext = niečo`. Nerozhoduje, či je to adresa
 * alebo súradnice — to sa dá zistiť až v `parseCoordinates`.
 *
 * Riadky bez `=` alebo bez kontextu ticho preskočí.
 */
export function textToPlaceEntries(text: string): PlaceEntry[] {
  const entries: PlaceEntry[] = [];

  for (const line of text.split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 0) continue;

    const context = line.slice(0, separator).trim().replace(/^@/, "");
    if (context === "") continue;

    const query = line.slice(separator + 1).trim();
    if (query === "") continue;

    entries.push({ context, query });
  }

  return entries;
}

/**
 * Je to dvojica súradníc? Ak áno, netreba sieť.
 *
 * Desatinná čiarka sa berie ako bodka: na slovenskej klávesnici je čiarka
 * prirodzenejšia a nikto nebude rozmýšľať nad tým, že súradnice sú Angličan.
 * Oddeľovačom dvojice je preto stredník ALEBO medzera, nie čiarka samotná —
 * inak by sa „48,14, 17,11" nedalo rozobrať jednoznačne.
 *
 * Musí to byť dvojica **a nič viac**: „100, Bratislava" je adresa, nie
 * súradnice, a nesmie prejsť len preto, že sa začína číslom.
 */
export function parseCoordinates(value: string): { lat: number; lon: number } | null {
  const parts = value.trim().split(/[;\s]+/).filter((part) => part !== "");
  if (parts.length !== 2) return null;

  /*
    Tvar sa overuje regulárnym výrazom, nie porovnaním s `parseFloat`.
    `parseFloat` číta len začiatok, takže „100abc" by prešlo ako 100 —
    a porovnanie `String(48.10) === "48.10"` by zas neplatilo, lebo koncová
    nula sa pri prevode späť stratí.
  */
  const COORDINATE = /^[+-]?\d+(?:\.\d+)?$/;
  const numbers: number[] = [];

  for (const part of parts) {
    // Koncová čiarka je oddeľovač dvojice („48.14, 17.11"), nie časť čísla.
    const cleaned = part.replace(/[,;]$/, "").replace(",", ".");
    if (!COORDINATE.test(cleaned)) return null;
    numbers.push(Number.parseFloat(cleaned));
  }

  const lat = numbers[0];
  const lon = numbers[1];
  if (lat === undefined || lon === undefined) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return { lat, lon };
}
