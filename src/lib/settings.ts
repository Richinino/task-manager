import { z } from "zod";

/**
 * Používateľské nastavenia. Uložené ako jsonb v `users.settings`,
 * aby sa dali rozširovať bez migrácie.
 */
export const settingsSchema = z.object({
  /** Max počet úloh na obrazovke „Dnes". Pridanie ďalšej vyžaduje niečo odobrať. */
  wipLimit: z.number().int().min(1).max(20).default(6),

  /** Dostupné hodiny dňa — základ pre rozpočet času. */
  dayStartHour: z.number().int().min(0).max(23).default(8),
  dayEndHour: z.number().int().min(1).max(24).default(18),

  /** Po koľkých odkladoch sa úloha zvýrazní. */
  postponeWarnAt: z.number().int().min(1).default(3),
  /** Po koľkých odkladoch vyskočí blokujúce rozhodnutie. */
  postponeBlockAt: z.number().int().min(2).default(5),

  /** Prvý deň týždňa: 1 = pondelok. */
  weekStartsOn: z.number().int().min(0).max(6).default(1),

  timezone: z.string().default("Europe/Bratislava"),

  /** Po koľkých dňoch bez dotyku nápad vyplává v inkubátore. */
  incubatorAfterDays: z.number().int().min(1).default(30),
  /** Po koľkých dňoch bez dotyku nápad „zhnije" (stage → faded). */
  fadeAfterDays: z.number().int().min(30).default(180),

  /**
   * Miesta — spájajú kontext s bodom na mape.
   *
   * `@domino` prestáva byť len slovom: keď stlačíš „som tu", appka zistí
   * polohu a nájde najbližšie z týchto miest. Sú v nastaveniach, nie vo
   * vlastnej tabuľke, lebo je ich hŕstka a nemenia sa.
   *
   * Zadáva sa **adresa**; súradnice sa z nej preložia raz pri uložení a držia
   * sa tu preto, že prehliadač o polohe povie čísla, nie adresu. Bez nich by
   * sa nedalo počítať, ktoré miesto je najbližšie.
   *
   * **Nie je to geofencing.** Poloha sa číta len vtedy, keď máš appku
   * otvorenú a sám si o to povieš — prehliadač appku na pozadí nespustí
   * a žiadne nastavenie to nezmení.
   */
  places: z
    .array(
      z.object({
        /** Kontext bez `@`, napríklad `domino`. */
        context: z.string().trim().min(1).max(64),
        /**
         * Adresa tak, ako bola napísaná. Nepovinná kvôli miestam uloženým
         * ešte pred adresami — tie majú len súradnice a majú ďalej fungovať.
         */
        address: z.string().trim().max(200).optional(),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      }),
    )
    .max(30)
    .default([]),

  /**
   * Pravidlá na automatické prideľovanie štítkov a kontextu.
   *
   * Píše si ich používateľ sám — appka nič nehádá ani sa neučí. Návrh sa
   * v zachytení **ponúkne, nevnúti**: automaticky priradený štítok, ktorý sa
   * nedá odmietnuť, je horší než žiadny, lebo po prvom omyle začneš
   * kontrolovať každý zápis.
   *
   * Je to jsonb v `users.settings`, takže pridanie nestálo migráciu.
   */
  autoTagRules: z
    .array(
      z.object({
        match: z.string().trim().min(1).max(80),
        tags: z.array(z.string().trim().min(1).max(64)).max(5).default([]),
        context: z.string().trim().max(64).optional(),
      }),
    )
    .max(50)
    .default([]),

  /**
   * Má sa denný rituál otvoriť sám, keď príde jeho čas?
   *
   * Časy sa neberú odtiaľto: ranné plánovanie sa viaže na `dayStartHour`,
   * večerný shutdown na `dayEndHour`. Týždenná a mesačná revízia sa
   * neotvárajú nikdy — na 15–30 minút práce sa treba rozhodnúť vedome.
   */
  ritualAutoOpen: z.boolean().default(true),

  /**
   * O koľko minút skôr má prísť pripomienka.
   *
   * Nula znamená „presne vtedy", čo je pri porade neskoro — kým človek
   * telefón vytiahne, už začala. Desať minút je dosť na to, aby sa dalo
   * dôjsť, a málo na to, aby sa na to medzitým zabudlo.
   *
   * Strop je dve hodiny: čo treba pripomenúť skôr, nie je pripomienka, ale
   * úloha na iný deň.
   *
   * Nastavenia sú JSONB so zod predvolenými hodnotami, takže pridanie poľa
   * NEPOTREBUJE migráciu — riadok bez neho dostane predvolenú hodnotu.
   */
  reminderLeadMin: z.number().int().min(0).max(120).default(10),

  theme: z.enum(["system", "light", "dark"]).default("system"),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/** Bezpečné načítanie — chýbajúce alebo pokazené polia padnú na default. */
export function parseSettings(raw: unknown): Settings {
  const result = settingsSchema.safeParse(raw ?? {});
  return result.success ? result.data : DEFAULT_SETTINGS;
}

/**
 * Existuje také časové pásmo?
 *
 * Neplatné pásmo by zhodilo `todayIn` na každej obrazovke — `Intl` naň hodí
 * `RangeError` a padla by celá stránka, nielen nastavenia. Preto sa overuje
 * pri ukladaní, nie pri čítaní.
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Schéma pre **ukladanie** nastavení. Používa ju výhradne `updateSettings`.
 *
 * Krížové kontroly zámerne nie sú v `settingsSchema`. Tú číta `parseSettings`,
 * ktorá pri chybe padá na `DEFAULT_SETTINGS` — jedna porušená dvojica by tak
 * používateľovi zhodila **všetky** ostatné nastavenia na predvolené, vrátane
 * časového pásma. Nekonzistentná hodnota v jednom poli je menšie zlo než tichý
 * reset celku, takže čítanie ostáva zhovievavé a prísny je až zápis.
 */
export const settingsInputSchema = settingsSchema
  .refine((s) => isValidTimeZone(s.timezone), {
    message: "Také časové pásmo neexistuje.",
    path: ["timezone"],
  })
  .refine((s) => s.dayEndHour > s.dayStartHour, {
    message: "Koniec dňa musí byť neskôr než jeho začiatok.",
    path: ["dayEndHour"],
  })
  .refine((s) => s.postponeBlockAt > s.postponeWarnAt, {
    message: "Prah blokovania musí byť vyšší než prah upozornenia.",
    path: ["postponeBlockAt"],
  })
  .refine((s) => s.fadeAfterDays > s.incubatorAfterDays, {
    message: "Nápad musí do inkubátora vyplávať skôr, než vybledne.",
    path: ["fadeAfterDays"],
  });
