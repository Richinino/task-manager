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
