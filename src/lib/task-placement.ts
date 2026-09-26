import { addDays } from "./dates";

/**
 * Kam úloha patrí — horizont podľa dňa a pravidlo, že otvorená úloha musí
 * byť vždy na nejakej obrazovke.
 *
 * Obe pravidlá tu žijú preto, že ich potrebuje viac akcií naraz (úlohy,
 * šablóny, opakovanie) a zo súboru s `"use server"` sa pomocná funkcia vyviezť
 * nedá. Predtým mala každá akcia vlastnú kópiu `horizonForDate` — a obe
 * kópie mali tú istú chybu.
 *
 * Čisté funkcie, bez databázy a bez `new Date()`.
 */

export type Horizon = "day" | "week" | "month" | "someday";

export type PlacementStatus = "inbox" | "todo" | "doing" | "waiting" | "done" | "dropped";

/**
 * Na ktorý horizont konkrétny deň patrí.
 *
 * dnes/zajtra → deň · do 7 dní → týždeň · čokoľvek neskôr → mesiac.
 *
 * **Deň nikdy nie je „niekedy".** „Niekedy" znamená vedome odložené BEZ dňa —
 * obrazovka „Niekedy" ich ukazuje ako veci, ktoré treba buď naplánovať,
 * alebo zahodiť. Pôvodné pravidlo dávalo „niekedy" každému dňu za hranicou
 * mesiaca a viac než týždeň dopredu: úloha naplánovaná 25. 9. na 9. 10.
 * tak skončila medzi odloženými, hoci mala presný deň.
 */
export function horizonForDate(date: string, todayIso: string): Horizon {
  if (date <= addDays(todayIso, 1)) return "day";
  if (date <= addDays(todayIso, 7)) return "week";
  return "month";
}

/** Čo o úlohe treba vedieť, aby sa dalo povedať, či je niekde vidieť. */
export interface PlacementFields {
  status: PlacementStatus;
  plannedDate: string | null;
  projectId: string | null;
  horizon: Horizon;
  parentTaskId: string | null;
}

/**
 * Má úloha svoje miesto mimo inboxu?
 *
 * Miesto dáva deň (Dnes, Týždeň, Mesiac), projekt (detail projektu),
 * „niekedy" (vlastný zoznam), čakanie (vlastný zoznam) alebo rodič (podúloha
 * sa kreslí pod ním).
 */
export function hasPlace(task: Omit<PlacementFields, "status"> & { status?: PlacementStatus }): boolean {
  return (
    task.plannedDate !== null ||
    task.projectId !== null ||
    task.horizon === "someday" ||
    task.parentTaskId !== null ||
    task.status === "waiting"
  );
}

/**
 * Otvorená úloha, ktorá nie je na žiadnej obrazovke.
 *
 * Inbox filtruje podľa stavu, ostatné obrazovky podľa dňa, projektu alebo
 * horizontu. Úloha v stave `todo` bez dňa, bez projektu a mimo „niekedy"
 * teda nebola nikde — existovala a zároveň bola nedosiahnuteľná. Takto sa
 * strácali úlohy po „Niekedy" vo večernom shutdowne, po zrušení dňa v detaile
 * a po zmazaní projektu.
 */
export function isOrphaned(task: PlacementFields): boolean {
  if (task.status !== "todo" && task.status !== "doing") return false;
  return !hasPlace(task);
}

/**
 * Stav, do ktorého sa úloha po zmene vráti, aby bola vidieť.
 *
 * Uzavretú, čakajúcu ani už nezaradenú úlohu nemení. Otvorenú úlohu bez
 * miesta pošle do inboxu — tam patrí všetko, o čom ešte nie je rozhodnuté.
 */
export function visibleStatus(task: PlacementFields): PlacementStatus {
  return isOrphaned(task) ? "inbox" : task.status;
}
