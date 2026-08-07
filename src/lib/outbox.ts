/**
 * Fronta zachytených úloh, ktoré ešte neodišli na server.
 *
 * Toto je jediné miesto v aplikácii, ktoré prežije zavretie prehliadača bez
 * pripojenia. Nápad napísaný v aute musí byť po návrate signálu stále tam —
 * preto IndexedDB a nie `localStorage` (ten je synchrónny a v niektorých
 * prehliadačoch sa pri nedostatku miesta ticho zahodí).
 *
 * Bez knižnice zámerne: jeden object store s kľúčom `id` je pár desiatok
 * riadkov a nestojí za ďalšiu závislosť.
 *
 * **Nič tu nesmie zhodiť aplikáciu.** IndexedDB nie je dostupné v súkromnom
 * okne Firefoxu, v starších WebView a vo vnorených rámoch s prísnymi
 * pravidlami. V takom prípade sa čítanie tvári ako prázdna fronta a `enqueue`
 * odmietne s chybou — volajúci tak vie, že úlohu nemá čím zachrániť, a povie
 * to používateľovi namiesto toho, aby ju ticho zahodil.
 *
 * Súbor patrí do `src/lib/**`, takže nesmie importovať nič zo `src/db/**`
 * ani `src/server/**`. Jediná závislosť je generátor identifikátorov.
 */

const DB_NAME = "task-manazer";
const DB_VERSION = 1;
const STORE = "outbox";

/**
 * Otvorenie IndexedDB vie v niektorých prehliadačoch (súkromné okno Firefoxu,
 * zamknutá databáza inou záložkou) nikdy neodpovedať — ani úspechom, ani
 * chybou. Bez tejto poistky by `await enqueue(...)` visel navždy a používateľ
 * by pozeral na točiace sa koliesko.
 */
const OPEN_TIMEOUT_MS = 4000;

/** Jedna položka čakajúca na odoslanie. */
export interface OutboxItem {
  /** uuidv7 — časovo zoradené, takže poradie vo fronte drží samo od seba. */
  id: string;
  /** Text tak, ako ho používateľ napísal. Parser beží až na serveri. */
  raw: string;
  /** Deň z tlačidla „+", ak úloha vznikla z neho (RRRR-MM-DD). */
  defaultPlannedDate?: string;
  /** `Date.now()` v čase zaradenia — pre poradie a prípadné ladenie. */
  createdAt: number;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRIPOJENIE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Otvorená databáza sa drží medzi volaniami. `null` znamená „tu to nejde" —
 * a je to rovnocenný, očakávaný výsledok, nie chyba.
 */
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise !== null) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    // Na serveri (RSC, prerender) `indexedDB` neexistuje. Modul sa tam môže
    // pokojne načítať, len sa nikdy nesmie pokúsiť čokoľvek otvoriť.
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (db: IDBDatabase | null): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve(db);
    };

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // Samotné `open` hádže napríklad v súkromnom okne alebo pri zakázaných
      // súboroch cookie tretích strán.
      finish(null);
      return;
    }

    timer = setTimeout(() => finish(null), OPEN_TIMEOUT_MS);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      /*
        Keď iná záložka požiada o novšiu verziu schémy, musíme sa zavrieť —
        inak jej upgrade zablokujeme a ona zamrzne. Zároveň zabudneme
        pripojenie, aby si ho ďalšie volanie otvorilo nanovo.
      */
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      finish(db);
    };

    request.onerror = () => finish(null);
    request.onblocked = () => finish(null);
  });

  return dbPromise;
}

/**
 * Jedna operácia v jednej transakcii.
 *
 * Odmietnutie znamená skutočnú chybu úložiska (plná kvóta, prerušená
 * transakcia) — nie „IndexedDB tu nie je". To rieši `openDb` vrátením `null`.
 */
function runRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(STORE, mode);
    } catch (error) {
      // Napríklad `InvalidStateError`, keď sa spojenie medzitým zavrelo.
      dbPromise = null;
      reject(error instanceof Error ? error : new Error("Úložisko nie je dostupné."));
      return;
    }

    let request: IDBRequest;
    try {
      request = run(tx.objectStore(STORE));
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Úložisko nie je dostupné."));
      return;
    }

    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () =>
      reject(request.error ?? new Error("Zápis do úložiska zlyhal."));
    tx.onabort = () =>
      reject(tx.error ?? new Error("Transakcia úložiska bola prerušená."));
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   OVERENIE TVARU

   Do úložiska sa dostane len to, čo sem zapíšeme, ale čítame aj to, čo tam
   nechala staršia verzia aplikácie. Poškodený záznam nesmie zablokovať frontu,
   preto sa pri čítaní ticho preskočí.
   ═══════════════════════════════════════════════════════════════════════════ */

function toOutboxItem(value: unknown): OutboxItem | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;

  const id = record["id"];
  const raw = record["raw"];
  const createdAt = record["createdAt"];
  const planned = record["defaultPlannedDate"];

  if (typeof id !== "string" || id === "") return null;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;

  const item: OutboxItem = { id, raw, createdAt };
  if (typeof planned === "string" && planned !== "") {
    item.defaultPlannedDate = planned;
  }
  return item;
}

/* ═══════════════════════════════════════════════════════════════════════════
   VEREJNÉ ROZHRANIE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Zaradí úlohu do fronty.
 *
 * Odmietne, ak úložisko nie je k dispozícii alebo zápis zlyhá — volajúci to
 * musí ukázať používateľovi. Tichý neúspech by znamenal stratený nápad, a to
 * je presne to, čomu má celý tento modul zabrániť.
 */
export async function enqueue(item: OutboxItem): Promise<void> {
  const db = await openDb();
  if (db === null) {
    throw new Error("Úložisko prehliadača nie je dostupné.");
  }
  // Uložíme čistý objekt: štruktúrovaný klon nezvládne triedy ani funkcie,
  // ktoré by mohli priletieť z volajúceho.
  const record: OutboxItem = {
    id: item.id,
    raw: item.raw,
    createdAt: item.createdAt,
  };
  if (item.defaultPlannedDate !== undefined) {
    record.defaultPlannedDate = item.defaultPlannedDate;
  }
  await runRequest<IDBValidKey>(db, "readwrite", (store) => store.put(record));
}

/**
 * Celá fronta v poradí, v akom vznikla.
 *
 * Mimo dostupného úložiska vráti prázdne pole — appka sa tak správa, akoby
 * nič nečakalo, čo je pravda: nemá kam nič odložiť.
 */
export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await openDb();
  if (db === null) return [];

  let rows: unknown[];
  try {
    rows = await runRequest<unknown[]>(db, "readonly", (store) => store.getAll());
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];

  const items: OutboxItem[] = [];
  for (const row of rows) {
    const item = toOutboxItem(row);
    if (item !== null) items.push(item);
  }
  // uuidv7 nesie čas v predpone, ale `createdAt` je priamejší a nezávisí
  // od toho, ako identifikátor vznikol.
  items.sort((a, b) => a.createdAt - b.createdAt);
  return items;
}

/**
 * Vyhodí položku z fronty. Volá sa po úspešnom odoslaní — a tiež vtedy, keď
 * server vstup odmietol, lebo taká položka by inak čakala navždy.
 */
export async function removeFromOutbox(id: string): Promise<void> {
  const db = await openDb();
  if (db === null) return;
  try {
    await runRequest<undefined>(db, "readwrite", (store) => store.delete(id));
  } catch {
    // Nepodarilo sa zmazať — položka sa skúsi odoslať znova. Duplicitná úloha
    // je menšie zlo než zhodená obrazovka.
  }
}

/** Koľko úloh čaká. Mimo dostupného úložiska vždy 0. */
export async function countOutbox(): Promise<number> {
  const db = await openDb();
  if (db === null) return 0;
  try {
    const count = await runRequest<number>(db, "readonly", (store) => store.count());
    return typeof count === "number" && Number.isFinite(count) ? count : 0;
  } catch {
    return 0;
  }
}
