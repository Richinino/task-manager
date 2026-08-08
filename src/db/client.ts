import * as schema from "./schema";

/**
 * Továreň na databázové spojenie. Zámerne BEZ `server-only`, aby sa dala
 * použiť aj zo skriptov mimo Next.js (seed, migrácie, údržba).
 * Aplikačný kód importuje `@/db`, nie tento súbor.
 *
 *  • lokálny vývoj  → PGlite (vstavaný Postgres v .data/), bez účtov a setupu
 *  • produkcia      → Neon / akýkoľvek Postgres cez DATABASE_URL
 */

export type Database = Awaited<ReturnType<typeof createDb>>;

async function createDb() {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
    const pool = new Pool({
      connectionString: url,
      ssl: isLocal ? false : { rejectUnauthorized: true },
      /*
        V serverless prostredí obsluhuje jedna inštancia funkcie jednu
        požiadavku, takže veľký pool nemá čo robiť — len by zbytočne držal
        spojenia, ktorých má Neon v bezplatnom pláne obmedzený počet.
      */
      max: 3,
      /*
        Bez limitu by sa čakanie na spiaci Neon ťahalo, kým Vercel funkciu
        nezabije — a používateľ by videl prázdnu chybu bez príčiny. Takto
        dostane zrozumiteľnú hlášku o časovom limite spojenia.
      */
      connectionTimeoutMillis: 8000,
    });
    return drizzle(pool, { schema, casing: "snake_case" });
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL musí byť nastavené v produkcii. PGlite je určený len na lokálny vývoj.",
    );
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const { dirname } = await import("node:path");

  /**
   * Kam si PGlite ukladá dáta. Predvolene `.data/db` v projekte.
   *
   * Prepínač `PGLITE_DATA_DIR` existuje kvôli priečinkom, ktoré na pozadí
   * synchronizuje cloud (OneDrive, Dropbox, iCloud). Taký priečinok mení súbory
   * pod rukami bežiacej databáze — zápis prejde, ale pri ďalšom otvorení PGlite
   * spadne na „failed to initialize properly". Riešenie je mať dáta mimo
   * synchronizovaného stromu, napr. `PGLITE_DATA_DIR=C:/pgdata/task-manazer`.
   */
  const dataDir = process.env.PGLITE_DATA_DIR?.trim() || "./.data/db";

  // PGlite vytvára dátový priečinok nerekurzívne — rodiča musíme založiť sami.
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dirname(dataDir), { recursive: true });

  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema, casing: "snake_case" });

  // Lokálne migrujeme automaticky — žiadny manuálny krok pri štarte.
  await migrate(db, { migrationsFolder: "./src/db/migrations" });

  return db;
}

/**
 * Singleton, ktorý prežije hot reload. Bez neho by každý reload otvoril
 * nové spojenie a PGlite by sa zamkol na súbore.
 */
const globalForDb = globalThis as unknown as { __dbPromise?: Promise<Database> };

export function getDb(): Promise<Database> {
  const cached = globalForDb.__dbPromise;
  if (cached !== undefined) return cached;

  /*
    Neúspech sa NESMIE uložiť do cache.

    Neon v bezplatnom pláne po nečinnosti uspí databázu a prvé spojenie po
    prebudení môže trvať sekundy alebo vypršať. Keby tu ostal zamietnutý
    prísľub, tá istá inštancia funkcie by ho vracala už navždy — jeden
    nešťastný prvý pokus by appku zablokoval, kým Vercel funkciu neuspí.
    Preto pri chybe cache vyprázdnime a ďalšia požiadavka to skúsi odznova.
  */
  const promise = createDb().catch((error: unknown) => {
    if (globalForDb.__dbPromise === promise) globalForDb.__dbPromise = undefined;
    console.error("[db] Spojenie s databázou zlyhalo:", error);
    throw error;
  });

  globalForDb.__dbPromise = promise;
  return promise;
}

export { schema };
