import { describe, expect, it } from "vitest";

/*
  Kontrola migrácií žije v `scripts/`, lebo ju spúšťa build obyčajným
  `node` — bez tsx a bez aliasov, aby v ceste nasadenia bolo čo najmenej
  pohyblivých častí. Jej rozhodovacia časť je však presne to, na čom
  závisí, či sa appka nasadí, takže test patrí sem k ostatným.
*/
import { dovodPreskocenia, porovnajMigracie } from "../../scripts/migracie.mjs";

/** Žurnál v tvare, v akom ho číta `readMigrationFiles` z Drizzle. */
const ZURNAL = [
  { tag: "0000_zaklad", when: 1000, hash: "a" },
  { tag: "0001_udalosti", when: 2000, hash: "b" },
  { tag: "0002_pripomienky", when: 3000, hash: "c" },
];

describe("porovnajMigracie", () => {
  it("keď dobehlo všetko, nehlási nič", () => {
    const vysledok = porovnajMigracie(ZURNAL, [
      { hash: "a", createdAt: 1000 },
      { hash: "b", createdAt: 2000 },
      { hash: "c", createdAt: 3000 },
    ]);
    expect(vysledok).toEqual({ chybajuce: [], zmenene: [] });
  });

  /*
    Toto je ten prípad, kvôli ktorému kontrola vznikla: v repozitári leží
    migrácia, ktorá v produkcii nedobehla.
  */
  it("nájde migráciu, ktorá v databáze nie je", () => {
    const vysledok = porovnajMigracie(ZURNAL, [
      { hash: "a", createdAt: 1000 },
      { hash: "b", createdAt: 2000 },
    ]);
    expect(vysledok.chybajuce).toEqual(["0002_pripomienky"]);
    expect(vysledok.zmenene).toEqual([]);
  });

  it("nájde aj viac nedobehnutých naraz", () => {
    const vysledok = porovnajMigracie(ZURNAL, [{ hash: "a", createdAt: 1000 }]);
    expect(vysledok.chybajuce).toEqual(["0001_udalosti", "0002_pripomienky"]);
  });

  /*
    Prázdna databáza nemá ani tabuľku migrácií. Hranica je vtedy −1 a
    nedobehnuté je všetko — presne ako to spraví samotný migrátor.
  */
  it("na prázdnej databáze je nedobehnuté všetko", () => {
    const vysledok = porovnajMigracie(ZURNAL, []);
    expect(vysledok.chybajuce).toEqual([
      "0000_zaklad",
      "0001_udalosti",
      "0002_pripomienky",
    ]);
  });

  it("prázdny žurnál nemá čo hlásiť", () => {
    expect(porovnajMigracie([], [])).toEqual({ chybajuce: [], zmenene: [] });
  });

  /*
    Upravená migrácia, ktorá už dobehla. Migrátor sa rozhoduje podľa času,
    nie podľa obsahu, takže ju druhýkrát nepustí — rozdiel by ticho ležal
    v repozitári a v databáze by nikdy nebol.
  */
  it("nájde už nasadenú migráciu, ktorej sa zmenil obsah", () => {
    const vysledok = porovnajMigracie(ZURNAL, [
      { hash: "a", createdAt: 1000 },
      { hash: "INE", createdAt: 2000 },
      { hash: "c", createdAt: 3000 },
    ]);
    expect(vysledok.zmenene).toEqual(["0001_udalosti"]);
    expect(vysledok.chybajuce).toEqual([]);
  });

  /*
    Hranicou je NAJNOVŠIE `created_at`, nie počet riadkov. Keby sa porovnávali
    počty, databáza s dierou uprostred by prešla ako v poriadku.
  */
  it("rozhoduje najnovší čas, nie počet záznamov", () => {
    const vysledok = porovnajMigracie(ZURNAL, [{ hash: "c", createdAt: 3000 }]);
    expect(vysledok.chybajuce).toEqual([]);
    // Prvé dve sú pod hranicou, ale ich hash v databáze nie je.
    expect(vysledok.zmenene).toEqual(["0000_zaklad", "0001_udalosti"]);
  });
});

describe("dovodPreskocenia", () => {
  /*
    Toto je jediné miesto, ktoré rozhoduje, či sa siahne na ostrú databázu.
    Preto sa neskúša „že to funguje", ale každý spôsob, akým sa dá pomýliť.
  */
  it("pri produkčnom nasadení migruje", () => {
    expect(
      dovodPreskocenia({ DATABASE_URL: "postgres://x", VERCEL_ENV: "production" }),
    ).toBeNull();
  });

  it("náhľadový build na produkčnú databázu NESIAHNE", () => {
    expect(
      dovodPreskocenia({ DATABASE_URL: "postgres://x", VERCEL_ENV: "preview" }),
    ).toContain("preview");
  });

  /*
    Najnebezpečnejší prípad: `npm run build` na vlastnom počítači, keď má
    človek v prostredí ešte produkčnú premennú z predchádzajúceho príkazu.
  */
  it("lokálny build s produkčnou premennou tiež nesiahne", () => {
    expect(dovodPreskocenia({ DATABASE_URL: "postgres://x" })).toContain(
      "mimo Vercelu",
    );
  });

  it("bez DATABASE_URL nemá čo migrovať", () => {
    expect(dovodPreskocenia({ VERCEL_ENV: "production" })).toContain("PGlite");
    expect(dovodPreskocenia({ DATABASE_URL: "   ", VERCEL_ENV: "production" })).toContain(
      "PGlite",
    );
  });

  it("vynútenie preváži prostredie", () => {
    expect(
      dovodPreskocenia({ DATABASE_URL: "postgres://x", MIGROVAT_PRI_BUILDE: "1" }),
    ).toBeNull();
  });

  /*
    Únikový východ musí vypnúť aj vynútenie — inak by neexistoval spôsob,
    ako nasadiť opravu, keby sa pokazil samotný migračný krok.
  */
  it("únikový východ preváži aj vynútenie", () => {
    expect(
      dovodPreskocenia({
        DATABASE_URL: "postgres://x",
        VERCEL_ENV: "production",
        MIGROVAT_PRI_BUILDE: "1",
        SKIP_MIGRATION: "1",
      }),
    ).toBe("SKIP_MIGRATION=1");
  });
});

