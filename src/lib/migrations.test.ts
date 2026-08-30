import { describe, expect, it } from "vitest";

/*
  Kontrola migrácií žije v `scripts/`, lebo ju spúšťa build obyčajným
  `node` — bez tsx a bez aliasov, aby v ceste nasadenia bolo čo najmenej
  pohyblivých častí. Jej rozhodovacia časť je však presne to, na čom
  závisí, či sa appka nasadí, takže test patrí sem k ostatným.
*/
import { porovnajMigracie } from "../../scripts/migracie.mjs";

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
