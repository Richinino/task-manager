import { readFileSync } from "node:fs";

import { is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

/*
  Záloha má obsahovať všetko. Dvakrát nie — formát 1 zabudol rozvrh a učenie,
  formát 2 udalosti — a zakaždým sa na to prišlo až pri čítaní kódu, lebo
  chýbajúca tabuľka nič nezhodí: export prejde, súbor sa stiahne, len v ňom
  niečo nie je.

  Test preto berie tabuľky priamo zo schémy. Nová tabuľka musí byť buď
  v `route.ts`, alebo tu medzi vedome vynechanými aj s dôvodom. Tretíkrát
  sa to nestane potichu.
*/

const VEDOME_VYNECHANE: Record<string, string> = {
  users: "ide ako objekt `user` — meno, e-mail a nastavenia, nie celý riadok",
  accounts: "poverenia ku Googlu (refresh token) do súboru v stiahnutých nepatria",
  pushSubscriptions: "kľúče prehliadača platia pre jedno zariadenie, na obnovu sú k ničomu",
  oauthClients: "registrácie MCP klientov (Claude) — po obnove sa klient zaregistruje znova",
  oauthCodes: "jednorazové kódy s desaťminútovou platnosťou, v zálohe by boli mŕtve",
  oauthGrants: "prístupy MCP klientov — odtlačky tokenov do zálohy nepatria, Claude sa pripojí znova",
};

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

const tabulky = Object.entries(schema)
  .filter(([, value]) => is(value, PgTable))
  .map(([name]) => name);

/** Tabuľka sa číta buď priamo, alebo cez spojenie s rodičom (`getTableColumns`). */
function vExporte(name: string): boolean {
  return new RegExp(`\\.from\\(${name}\\)|getTableColumns\\(${name}\\)`).test(route);
}

describe("export", () => {
  it("číta každú tabuľku zo schémy, ktorá nie je vedome vynechaná", () => {
    const chybajuce = tabulky.filter((name) => !(name in VEDOME_VYNECHANE) && !vExporte(name));
    expect(chybajuce).toEqual([]);
  });

  it("vynechané tabuľky existujú a export ich naozaj nečíta", () => {
    for (const name of Object.keys(VEDOME_VYNECHANE)) {
      expect(tabulky).toContain(name);
      expect(vExporte(name)).toBe(false);
    }
  });

  it("udalosti sú v exporte", () => {
    expect(vExporte("agendaItems")).toBe(true);
    expect(vExporte("agendaReminders")).toBe(true);
  });
});
