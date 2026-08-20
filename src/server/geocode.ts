/**
 * Preklad adresy na súradnice (geokódovanie).
 *
 * Prehliadač o polohe povie zemepisnú šírku a dĺžku, nie adresu. Aby sa dalo
 * odpovedať na otázku „som pri Domine?", musia byť obe strany porovnania
 * body — adresu teda treba raz preložiť. Deje sa to **pri ukladaní miesta**,
 * nie pri každom stlačení „som tu": adresa sa nehýbe a sieť pri tom netreba.
 *
 * **Toto je jediné miesto v celej appke, kde niečo odchádza von.** Odosiela sa
 * napísaná adresa, nič iné — žiadne úlohy, žiadne id, žiadna poloha telefónu.
 * Volá sa zo servera, nie z prehliadača: Nominatim vyžaduje hlavičku
 * `User-Agent`, ktorú prehliadač nastaviť nedá, a odpadá tým aj CORS.
 *
 * Prečo Nominatim (OpenStreetMap): je zadarmo, bez kľúča a bez registrácie.
 * Za to má pravidlá, ktoré tu treba dodržať — najviac jeden dopyt za sekundu
 * a volajúci sa musí predstaviť. Na hrsť miest uložených raz za čas je to
 * pohodlne v medziach; hromadné prekladanie adries by v nich nebolo.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/**
 * Nominatim bez rozpoznateľnej identifikácie odpovedá 403. Nie je to kľúč,
 * len slušnosť vyžadovaná pravidlami používania.
 */
const USER_AGENT = "task-manazer/1.0 (osobny task manazer)";

/** Koľko čakať medzi dvoma dopytmi, aby sa dodržal limit jeden za sekundu. */
export const GEOCODE_GAP_MS = 1100;

/** Keď služba neodpovie, nemá zmysel čakať donekonečna. */
const TIMEOUT_MS = 8000;

export interface GeocodeHit {
  lat: number;
  lon: number;
  /** Ako si adresu vyložila služba — na kontrolu, či trafila správne miesto. */
  label: string;
}

/**
 * Nájde súradnice adresy, alebo `null`, keď ju služba nepozná.
 *
 * `null` je bežná odpoveď, nie porucha: preklep v adrese je oveľa
 * pravdepodobnejší než výpadok Nominatimu. Volajúci to preto nemá brať ako
 * chybu ukladania, ale povedať, ktorý riadok sa nepodarilo nájsť — miesto
 * bez súradníc by sa totiž nikdy nezhodovalo a mlčky by nefungovalo.
 */
export async function geocodeAddress(query: string): Promise<GeocodeHit | null> {
  const trimmed = query.trim();
  if (trimmed === "") return null;

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "sk,cs,en" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Odpoveď sa ukladá k miestu, nie do cache Next.js — tá by tu len
      // držala dáta, o ktoré po uložení už nikto nestojí.
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`[geocode] Nominatim odpovedal ${response.status}`);
      return null;
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data)) return null;

    const first: unknown = data[0];
    if (first === undefined || first === null || typeof first !== "object") return null;

    const record = first as Record<string, unknown>;
    // Nominatim vracia súradnice ako reťazce, nie čísla.
    const lat = Number.parseFloat(String(record["lat"] ?? ""));
    const lon = Number.parseFloat(String(record["lon"] ?? ""));
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

    const label = typeof record["display_name"] === "string" ? record["display_name"] : trimmed;
    return { lat, lon, label };
  } catch (error) {
    console.error("[geocode] adresu sa nepodarilo preložiť", error);
    return null;
  }
}
