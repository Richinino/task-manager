"use server";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, type Database } from "@/db";
import { areas, ideas, journal, links, projects, tasks } from "@/db/schema";
import { fold } from "@/lib/fold";
import { uuidv7 } from "@/lib/id";
import { parseWikiLinks } from "@/lib/wikilink";
import { requireUser } from "@/server/auth-guard";
import { resolveLinkTargets, type LinkEntityType } from "@/server/queries/links";

/* ═══════════════════════════════════════════════════════════════════════════
   ODKAZY [[…]] — ZÁPIS

   Jediná akcia: `syncLinks`. PREPOČÍTAVA, nedopĺňa — zmazaný `[[odkaz]]` musí
   zmiznúť aj z tabuľky. Bez toho by `links` po pár úpravách textu obsahovala
   väzby, ktoré v texte dávno nie sú, a spätné odkazy by ukazovali na vety,
   ktoré nikto nenapísal.

   Volá sa PO uložení textu, nie v tej istej transakcii. Je to zámer: text je
   pravda a index sa z neho dá kedykoľvek postaviť znova, takže zlyhaný zápis
   do `links` nesmie zhodiť uloženie poznámky. Opačné poradie by obetovalo to
   cennejšie kvôli tomu, čo je odvodené.
   ═══════════════════════════════════════════════════════════════════════════ */

export type { ActionResult } from "@/server/action-result";
import type { ActionResult } from "@/server/action-result";

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDÁCIA
   ═══════════════════════════════════════════════════════════════════════════ */

const idSchema = z.string().min(1, "Chýba identifikátor.");

/**
 * Tie isté hodnoty ako `entity_type` v schéme. Zoznam musí byť aj tu, lebo
 * zod potrebuje hodnoty za behu — že sedí s databázou, stráži priradenie
 * do `LinkEntityType` nižšie: keby zod pripustil šiestu hodnotu, preklad padne.
 */
const entityTypeSchema = z.enum(["task", "idea", "project", "area", "journal"]);

/**
 * Strop dĺžky textu. Nie je to bezpečnostná hranica, ale poistka proti
 * náhodne poslanému megabajtu — poznámka v tejto appke má strop 10 000 znakov
 * a denníkový zápis je krátky.
 */
const textSchema = z.string().max(100_000, "Text je príliš dlhý.");

/* ═══════════════════════════════════════════════════════════════════════════
   POMOCNÍCI
   ═══════════════════════════════════════════════════════════════════════════ */

function invalid(error: z.ZodError, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? fallback };
}

/** Výnimka sa nikdy nedostane ku klientovi — zaloguje sa a nahradí hláškou. */
function fail(error: unknown, message: string): { ok: false; error: string } {
  console.error(`[actions/links] ${message}`, error);
  return { ok: false, error: message };
}

/**
 * Existuje zdroj odkazu a patrí tomuto používateľovi?
 *
 * Bez tejto kontroly by sa dali do `links` zapísať riadky s výmyslom v
 * `from_id` — cudzí obsah by sa tým nesprístupnil, ale index by sa zaplnil
 * väzbami, ktoré nikdy nikto neprepočíta, lebo im chýba text.
 *
 * Denník mäkké mazanie nemá, ostatné štyri tabuľky áno.
 */
async function sourceExists(
  db: Database,
  userId: string,
  kind: LinkEntityType,
  id: string,
): Promise<boolean> {
  if (kind === "task") {
    const rows = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .limit(1);
    return rows[0] !== undefined;
  }

  if (kind === "idea") {
    const rows = await db
      .select({ id: ideas.id })
      .from(ideas)
      .where(and(eq(ideas.id, id), eq(ideas.userId, userId), isNull(ideas.deletedAt)))
      .limit(1);
    return rows[0] !== undefined;
  }

  if (kind === "project") {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(eq(projects.id, id), eq(projects.userId, userId), isNull(projects.deletedAt)),
      )
      .limit(1);
    return rows[0] !== undefined;
  }

  if (kind === "area") {
    const rows = await db
      .select({ id: areas.id })
      .from(areas)
      .where(and(eq(areas.id, id), eq(areas.userId, userId), isNull(areas.deletedAt)))
      .limit(1);
    return rows[0] !== undefined;
  }

  const rows = await db
    .select({ id: journal.id })
    .from(journal)
    .where(and(eq(journal.id, id), eq(journal.userId, userId)))
    .limit(1);
  return rows[0] !== undefined;
}

/* ═══════════════════════════════════════════════════════════════════════════
   AKCIA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Prepočíta riadky v `links` podľa toho, čo je práve napísané v texte.
 *
 * Postup: z textu sa vyberú `[[odkazy]]`, k názvom sa dohľadajú entity (bez
 * ohľadu na diakritiku), a v jednej transakcii sa STARÉ RIADKY ZMAŽÚ a
 * nahradia novými. Prepočet, nie dopĺňanie — inak by odkaz odstránený z textu
 * v tabuľke prežil.
 *
 * **Nenájdená entita nie je chyba.** Riadok v `links` jednoducho nevznikne,
 * odkaz ostáva v texte ako `[[text]]` a ožije v deň, keď entita s tým názvom
 * vznikne — stačí text znova uložiť. Vynucovať existenciu vopred by z písania
 * spravilo administratívu.
 *
 * `unresolved` sa vracia preto, aby rozhranie vedelo pokojne povedať „dva
 * odkazy zatiaľ nikam nevedú", nie preto, aby to hlásilo ako problém.
 */
export async function syncLinks(
  fromType: LinkEntityType,
  fromId: string,
  text: string,
): Promise<ActionResult<{ linked: number; unresolved: number }>> {
  const user = await requireUser();
  try {
    const typeParsed = entityTypeSchema.safeParse(fromType);
    if (!typeParsed.success) return invalid(typeParsed.error, "Neznámy druh entity.");
    // Poistka, že zoznam v zode nepredbehol schému — inak by preklad zlyhal tu.
    const kind: LinkEntityType = typeParsed.data;

    const idParsed = idSchema.safeParse(fromId);
    if (!idParsed.success) return invalid(idParsed.error, "Chýba identifikátor zdroja.");

    /*
      Chýbajúci text sa NEBERIE ako prázdny. Prázdny text znamená „zmaž
      všetky odkazy" a to je príliš veľká škoda na to, aby ju spôsobil
      preklep vo volaní.
    */
    if (typeof text !== "string") return { ok: false, error: "Text odkazov chýba." };

    const textParsed = textSchema.safeParse(text);
    if (!textParsed.success) return invalid(textParsed.error, "Neplatný text.");

    const db = await getDb();

    if (!(await sourceExists(db, user.id, kind, idParsed.data))) {
      return { ok: false, error: "Zdroj odkazu sa nenašiel." };
    }

    const labels = [
      ...new Set(parseWikiLinks(textParsed.data).map((link) => fold(link.label))),
    ];
    const targets = await resolveLinkTargets(user.id, labels);

    /*
      Rôzne názvy môžu ukazovať na tú istú entitu („Byt" a „byt"), a tá istá
      entita sa v texte pokojne spomenie päťkrát. Do tabuľky patrí jeden
      riadok — `links` hovorí ČI odkaz existuje, nie koľkokrát je napísaný.
    */
    const rows = new Map<string, { toType: LinkEntityType; toId: string }>();
    for (const label of labels) {
      const target = targets.get(label);
      if (!target) continue;
      /*
        Odkaz sám na seba sa zahodí. V texte ostáva a funguje ako odkaz,
        ale v spätných odkazoch by sa entita ohlásila sama sebe — to je šum,
        nie informácia.
      */
      if (target.kind === kind && target.id === idParsed.data) continue;
      rows.set(`${target.kind}:${target.id}`, { toType: target.kind, toId: target.id });
    }

    /*
      Nad stovkou rôznych názvov `resolveLinkTargets` zvyšok nehľadá, takže sa
      tu spočíta medzi nenájdené. Je to zámer: text s viac než sto rôznymi
      cieľmi je zoznam, nie poznámka s odkazmi, a presné číslo pri ňom nikomu
      nepomôže.
    */
    const unresolved = labels.filter((label) => !targets.has(label)).length;

    /*
      Mazanie a vkladanie v jednej transakcii. Medzistav, v ktorom by staré
      odkazy už boli preč a nové ešte nie, by spätné odkazy nakrátko vyprázdnil
      — a práve vtedy by sa niekto pozeral.
    */
    await db.transaction(async (tx) => {
      await tx
        .delete(links)
        .where(
          and(
            eq(links.userId, user.id),
            eq(links.fromType, kind),
            eq(links.fromId, idParsed.data),
          ),
        );

      if (rows.size === 0) return;

      await tx
        .insert(links)
        .values(
          [...rows.values()].map((row) => ({
            id: uuidv7(),
            userId: user.id,
            fromType: kind,
            fromId: idParsed.data,
            toType: row.toType,
            toId: row.toId,
          })),
        )
        .onConflictDoNothing();
    });

    /*
      Zámerne bez `revalidatePath`. Odkazy sa zatiaľ nikde nevykresľujú a
      revalidovať naslepo by len zahadzovalo vyrátané stránky. Obrazovka,
      ktorá spätné odkazy zobrazí, si revalidáciu pridá spolu s nimi.
    */
    return { ok: true, data: { linked: rows.size, unresolved } };
  } catch (error) {
    return fail(error, "Odkazy sa nepodarilo prepočítať.");
  }
}
