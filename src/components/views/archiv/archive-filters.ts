import type { Route } from "next";

import type { ArchiveKind } from "@/server/queries/archive";

/* ═══════════════════════════════════════════════════════════════════════════
   STAV OBRAZOVKY ŽIJE V ADRESE

   Dopyt aj prepínač druhu sú v `?q=` a `?druh=`, nie v klientskom stave. Sú to
   tri veci naraz: výsledok sa dá poslať odkazom, tlačidlo späť sa vráti k tomu,
   čo človek naozaj videl, a obrazovka funguje aj bez JavaScriptu — obyčajný
   `GET` formulár skončí presne na tej istej adrese.

   Hodnoty v adrese sú po slovensky rovnako ako cesty. `?druh=zmazane` prečíta
   aj ten, kto adresu len zbežne prebehne očami.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Ktorá priehradka archívu je otvorená. */
export type ArchiveFilterValue = "vsetko" | "hotove" | "zahodene" | "zmazane";

export interface ArchiveFilterOption {
  value: ArchiveFilterValue;
  label: string;
  /** Ktoré druhy archívu do priehradky patria. */
  kinds: readonly ArchiveKind[];
}

/**
 * Poradie je poradím v prepínači: najprv všetko, potom tri dôvody, prečo je
 * vec v archíve. „Zmazané" je posledné zámerne — je to jediná priehradka,
 * z ktorej sa veci vracajú, a nemá byť prvá vec, na ktorú padne oko.
 */
export const ARCHIVE_FILTERS: readonly ArchiveFilterOption[] = [
  { value: "vsetko", label: "Všetko", kinds: ["done", "dropped", "deleted"] },
  { value: "hotove", label: "Hotové", kinds: ["done"] },
  { value: "zahodene", label: "Zahodené", kinds: ["dropped"] },
  { value: "zmazane", label: "Zmazané", kinds: ["deleted"] },
];

/** Predvolená priehradka. Do adresy sa nepíše — čistá `/archiv` znamená toto. */
export const DEFAULT_ARCHIVE_FILTER: ArchiveFilterValue = "vsetko";

/**
 * `?druh=` z adresy.
 *
 * Čokoľvek neznáme padne na predvolené, nie na chybovú stránku: adresa je
 * niečo, čo si človek upraví v riadku prehliadača, a preklep v nej nemá appku
 * zhodiť.
 */
export function readArchiveFilter(
  raw: string | string[] | undefined,
): ArchiveFilterValue {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const found = ARCHIVE_FILTERS.find((option) => option.value === value);
  return found?.value ?? DEFAULT_ARCHIVE_FILTER;
}

/** `?q=` z adresy. Zopakovaný parameter aj chýbajúci skončia rovnako neškodne. */
export function readSearchQuery(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : "";
}

/** Ktoré druhy archívu má priehradka ukázať. */
export function archiveKindsFor(filter: ArchiveFilterValue): readonly ArchiveKind[] {
  return ARCHIVE_FILTERS.find((option) => option.value === filter)?.kinds ?? [];
}

/**
 * Adresa obrazovky s daným dopytom a priehradkou.
 *
 * Pretypovanie na `Route` je tu nutné zlo: `typedRoutes` overuje literál
 * napísaný v kóde, nie reťazec poskladaný za behu. Samotná cesta je pritom
 * stále jedna jediná a nikdy sa nemení — mení sa len to, čo je za otáznikom.
 */
export function archivHref(query: string, filter: ArchiveFilterValue): Route {
  const params = new URLSearchParams();

  const trimmed = query.trim();
  if (trimmed !== "") params.set("q", trimmed);
  // Predvoľba sa nepíše — inak by sa z každého kliknutia stala dlhá adresa.
  if (filter !== DEFAULT_ARCHIVE_FILTER) params.set("druh", filter);

  const search = params.toString();
  return (search === "" ? "/archiv" : `/archiv?${search}`) as Route;
}
