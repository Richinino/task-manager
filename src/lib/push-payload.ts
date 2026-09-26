import { formatDuration } from "./dates";

/**
 * Čo sa v notifikácii naozaj zobrazí.
 *
 * Čistá funkcia zámerne: obsah notifikácie sa dá takto otestovať bez servera,
 * bez siete a bez telefónu — a to je jediný spôsob, ako overiť text, ktorý
 * uvidíš raz denne a vždy len na chvíľu.
 *
 * ## Pravidlá, ktoré tu platia
 *
 * **Nadpis je názov úlohy, nie „Pripomienka".** Notifikácia sa číta jedným
 * pohľadom na zamknutej obrazovke; slovo „Pripomienka" je tam vždy rovnaké
 * a nepovie nič. Názov úlohy povie všetko.
 *
 * **Telo hovorí KEDY a AKO DLHO**, lebo to sú dve veci, podľa ktorých sa
 * človek rozhodne, či to teraz zvládne.
 *
 * **Značka (`tag`) je id úlohy.** Keď sa notifikácia pošle dvakrát — napríklad
 * po presune úlohy — druhá tú prvú nahradí namiesto toho, aby sa na seba
 * navŕšili.
 */
export interface PushPayload {
  title: string;
  body: string;
  /** Kam sa má appka otvoriť po ťuknutí. */
  url: string;
  /** Zoskupovanie notifikácií — rovnaká značka prepíše predošlú. */
  tag: string;
}

export interface ReminderTask {
  id: string;
  title: string;
  /** Hodina, na ktorú je úloha naplánovaná — „HH:MM" aj „HH:MM:SS" z databázy. */
  time: string | null;
  estimateMin: number | null;
  /** Koľko minút pred časom notifikácia odchádza. */
  leadMin: number;
}

/** Notifikácia bez názvu nemá čo zobraziť — tento text sa nikdy nemá ukázať. */
const BEZ_NAZVU = "Úloha bez názvu";

/**
 * Zostaví telo: kedy to začína a koľko to má trvať.
 *
 * Predstih sa píše slovami („o 10 minút"), nie hodinou — človek pri
 * notifikácii nepočíta. Nulový predstih znamená „teraz".
 */
/**
 * „HH:MM" bez sekúnd.
 *
 * Databáza vracia stĺpec `time` ako `14:30:00` a plánovač ho posielal
 * rovno sem — notifikácia potom hlásila „o 14:30:00". Obrazovky si čas
 * orezávajú samy, tu to chýbalo.
 */
function bezSekund(time: string): string {
  const zhoda = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(time.trim());
  return zhoda === null ? time : `${zhoda[1]!.padStart(2, "0")}:${zhoda[2]}`;
}

function telo(task: ReminderTask): string {
  const casti: string[] = [];

  if (task.time !== null) {
    const cas = bezSekund(task.time);
    casti.push(
      task.leadMin <= 0
        ? `Začína teraz, o ${cas}`
        : `O ${formatDuration(task.leadMin)} — o ${cas}`,
    );
  }

  if (task.estimateMin !== null) {
    casti.push(`odhad ${formatDuration(task.estimateMin)}`);
  }

  // Bez času aj bez odhadu ostáva aspoň dôvod, prečo notifikácia prišla.
  return casti.length === 0 ? "Naplánoval si to na teraz." : `${casti.join(" · ")}.`;
}

export function buildPushPayload(task: ReminderTask): PushPayload {
  const nazov = task.title.trim();

  return {
    title: nazov === "" ? BEZ_NAZVU : nazov,
    body: telo(task),
    /*
      Otvára sa „Dnes", nie detail úlohy. Notifikácia príde vtedy, keď sa má
      začať pracovať — a vtedy chceš vidieť celý deň, nie jednu kartu.
    */
    url: "/dnes",
    tag: `uloha-${task.id}`,
  };
}
