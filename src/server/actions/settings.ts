"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { schoolSubjects, users } from "@/db/schema";
import { parseCoordinates, textToPlaceEntries, type Place } from "@/lib/places";
import { type Settings, settingsInputSchema } from "@/lib/settings";
import { cleanAliases } from "@/lib/subject-match";
import { requireUser } from "@/server/auth-guard";
import { GEOCODE_GAP_MS, geocodeAddress } from "@/server/geocode";

/* ═══════════════════════════════════════════════════════════════════════════
   VÝSLEDOK AKCIE

   Spoločný tvar žije v `@/server/action-result`.
   ═══════════════════════════════════════════════════════════════════════════ */

export type { ActionResult } from "@/server/action-result";

import type { ActionResult } from "@/server/action-result";

/**
 * Cesty, ktoré nastavenia ovplyvňujú.
 *
 * Prakticky všetko: pásmo mení, ktorý deň je „dnes", prahy odkladov menia
 * farby odznakov, WIP limit hlášku na „Dnes", hodiny dňa rozpočet času
 * a prahy nápadov ich fázy. Lacnejšie je zneplatniť všetko než sa mýliť.
 */
const AFFECTED_PATHS = [
  "/dnes",
  "/tyzden",
  "/mesiac",
  "/inbox",
  "/niekedy",
  "/caka-sa-na",
  "/projekty",
  "/oblasti",
  "/napady",
  "/nastavenia",
] as const;

function revalidateViews(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/settings] ${message}`, error);
  return { ok: false, error: message };
}

/**
 * Uloží nastavenia.
 *
 * `patch` sa zlučuje nad **aktuálne** nastavenia, nie nad predvolené — inak by
 * uloženie jedného poľa ticho prepísalo všetky ostatné na defaulty. Zapisuje sa
 * vždy celý objekt, lebo `users.settings` je jeden jsonb stĺpec.
 *
 * Overuje `settingsInputSchema`, ktorá má navyše krížové kontroly (koniec dňa
 * po jeho začiatku, prah blokovania nad prahom upozornenia, vyblednutie po
 * inkubátore, existujúce časové pásmo). Tie zámerne nie sú v schéme, ktorou sa
 * nastavenia čítajú — podrobnosti v `src/lib/settings.ts`.
 */
export async function updateSettings(
  patch: Partial<Settings>,
): Promise<ActionResult<Settings>> {
  const user = await requireUser();
  try {
    const merged = { ...user.settings, ...patch };

    const parsed = settingsInputSchema.safeParse(merged);
    if (!parsed.success) return invalid(parsed.error, "Nastavenia sa nepodarilo uložiť.");
    const settings = parsed.data;

    const db = await getDb();
    await db.update(users).set({ settings }).where(eq(users.id, user.id));

    revalidateViews();
    return { ok: true, data: settings };
  } catch (error) {
    return fail(error, "Nastavenia sa nepodarilo uložiť.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   PREZÝVKY PREDMETOV

   Zvlášť od `updateSettings`, lebo skratka sa overuje proti predmetom
   v databáze a vstup sa upratuje (prázdne, opakované). Schéma nastavení má
   pri prezývkach `.catch({})`, aby pokazený záznam nezhodil celé nastavenia
   — overenie teda musí byť tu, inak by chybný vstup ticho zmazal všetko.
   ═══════════════════════════════════════════════════════════════════════════ */

const subjectAliasesSchema = z.object({
  code: z.string().trim().min(1, "Chýba predmet.").max(40, "Neplatný predmet."),
  aliases: z
    .array(z.string().max(60, "Prezývka môže mať najviac 60 znakov."))
    .max(12, "Jeden predmet môže mať najviac 12 prezývok."),
});

/** Prezývky jedného predmetu. Prázdny zoznam prezývky predmetu zmaže. */
export async function saveSubjectAliases(
  code: string,
  aliases: string[],
): Promise<ActionResult<string[]>> {
  const user = await requireUser();
  const parsed = subjectAliasesSchema.safeParse({ code, aliases });
  if (!parsed.success) return invalid(parsed.error, "Prezývky sa nepodarilo uložiť.");

  try {
    const db = await getDb();
    const [predmet] = await db
      .select({ code: schoolSubjects.code })
      .from(schoolSubjects)
      .where(and(eq(schoolSubjects.userId, user.id), eq(schoolSubjects.code, parsed.data.code)))
      .limit(1);
    if (predmet === undefined) return { ok: false, error: "Taký predmet v rozvrhu nemáš." };

    const ciste = cleanAliases(parsed.data.aliases);
    const prezyvky = { ...user.settings.subjectAliases };
    if (ciste.length === 0) delete prezyvky[predmet.code];
    else prezyvky[predmet.code] = ciste;

    await db
      .update(users)
      .set({ settings: { ...user.settings, subjectAliases: prezyvky } })
      .where(eq(users.id, user.id));

    revalidatePath("/nastavenia");
    return { ok: true, data: ciste };
  } catch (error) {
    return fail(error, "Prezývky sa nepodarilo uložiť.");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   MIESTA

   Zvláštna akcia, a nie len ďalšie pole v `updateSettings`, lebo jediná
   potrebuje sieť: adresu treba preložiť na súradnice. Trvá to sekundy, môže
   sa to nepodariť pre jeden riadok z piatich a formulár o tom musí vedieť
   povedať — to sa do „ulož záplatu" nezmestí.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SavedPlaces {
  settings: Settings;
  /**
   * Adresy, ktoré služba nepozná. Neuložili sa — miesto bez súradníc by sa
   * nikdy nezhodovalo a mlčky by nefungovalo.
   */
  unresolved: string[];
}

/** Rovnaká adresa? Porovnáva sa zhovievavo, aby preklep v medzere neplatil. */
function sameAddress(a: string | undefined, b: string): boolean {
  if (a === undefined) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Uloží miesta zadané ako text, riadok na miesto: `kontext = adresa`.
 *
 * Adresa sa prekladá na súradnice **len keď treba**:
 *  - dvojica čísel sa vezme rovno, bez siete,
 *  - nezmenená adresa si nechá súradnice, ktoré už má uložené,
 *  - preložia sa teda naozaj len nové a zmenené riadky.
 *
 * Bez toho by každé otvorenie a uloženie nastavení znovu bilo do Nominatimu
 * adresami, ktoré sa nepohli — a to je presne to, čo jeho pravidlá zakazujú.
 * Medzi skutočnými dopytmi sa čaká, aby sa dodržal limit jeden za sekundu.
 */
export async function savePlaces(text: string): Promise<ActionResult<SavedPlaces>> {
  const user = await requireUser();
  try {
    const entries = textToPlaceEntries(text);
    const known = user.settings.places;

    const places: Place[] = [];
    const unresolved: string[] = [];
    let queried = false;

    for (const entry of entries) {
      const coordinates = parseCoordinates(entry.query);
      if (coordinates !== null) {
        places.push({ context: entry.context, ...coordinates });
        continue;
      }

      const cached = known.find((place) => sameAddress(place.address, entry.query));
      if (cached !== undefined) {
        // Kontext sa mohol zmeniť aj pri nezmenenej adrese.
        places.push({ ...cached, context: entry.context });
        continue;
      }

      // Pauza patrí PRED dopyt, nie za posledný — inak by sa čakalo aj vtedy,
      // keď už nič nenasleduje.
      if (queried) await sleep(GEOCODE_GAP_MS);
      queried = true;

      const hit = await geocodeAddress(entry.query);
      if (hit === null) {
        unresolved.push(entry.query);
        continue;
      }

      places.push({
        context: entry.context,
        address: entry.query,
        lat: hit.lat,
        lon: hit.lon,
      });
    }

    const merged = { ...user.settings, places };
    const parsed = settingsInputSchema.safeParse(merged);
    if (!parsed.success) return invalid(parsed.error, "Miesta sa nepodarilo uložiť.");
    const settings = parsed.data;

    const db = await getDb();
    await db.update(users).set({ settings }).where(eq(users.id, user.id));

    revalidateViews();
    return { ok: true, data: { settings, unresolved } };
  } catch (error) {
    return fail(error, "Miesta sa nepodarilo uložiť.");
  }
}
