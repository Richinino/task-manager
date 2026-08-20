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
  lat: number;
  lon: number;
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

       domino = 48.1445, 17.1102

   Rovnaký vzor ako pri pravidlách automatických štítkov — a rovnako patrí do
   knižnice, nie do komponentu: sú to čisté funkcie a práve tu vzniká najviac
   chýb, okolo desatinnej čiarky a rozpísaného riadku.
   ═══════════════════════════════════════════════════════════════════════════ */

export function placesToText(places: readonly Place[]): string {
  return places
    .map((place) => `${place.context} = ${place.lat}, ${place.lon}`)
    .join("\n");
}

/**
 * Prečíta miesta z textu. Riadky, ktorým nerozumie, ticho preskočí.
 *
 * Desatinná čiarka sa berie ako bodka: na slovenskej klávesnici je čiarka
 * prirodzenejšia a nikto nebude rozmýšľať nad tým, že súradnice sú Angličan.
 * Oddeľovačom dvojice je preto stredník ALEBO medzera, nie čiarka samotná —
 * inak by sa „48,14, 17,11" nedalo rozobrať jednoznačne.
 */
export function textToPlaces(text: string): Place[] {
  const places: Place[] = [];

  for (const line of text.split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 0) continue;

    const context = line.slice(0, separator).trim().replace(/^@/, "");
    if (context === "") continue;

    const numbers = line
      .slice(separator + 1)
      .split(/[;\s]+/)
      .map((part) => Number.parseFloat(part.trim().replace(",", ".")))
      .filter((value) => !Number.isNaN(value));

    const lat = numbers[0];
    const lon = numbers[1];
    if (lat === undefined || lon === undefined) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

    places.push({ context, lat, lon });
  }

  return places;
}
