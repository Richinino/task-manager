/**
 * Oblasti, ktoré dostane každý nový používateľ.
 *
 * Žijú tu, a nie v `seed.ts`, lebo ich zakladajú **dve** miesta: ručný seed
 * (`npm run db:seed`) a prvé prihlásenie nového človeka (`ensureUser`
 * v `src/auth.ts`). Dva zoznamy by sa časom rozišli a druhý používateľ by
 * dostal inú appku než prvý.
 *
 * Prečo vôbec niečo zakladať: bez oblastí je appka po prvom prihlásení úplne
 * prázdna — nedá sa k ničomu priradiť okruh, farebné bodky nemajú čo
 * zobrazovať a nový človek nemá kam začať. Päť okruhov je dosť na to, aby
 * bolo vidno, ako to funguje, a málo na to, aby sa dali pokojne zmazať.
 *
 * Úlohy sa nezakladajú — ukážkové úlohy patria do seedu, nie do cudzej appky.
 */
export const DEFAULT_AREAS = [
  { name: "Práca", color: "indigo", icon: "briefcase" },
  { name: "Zdravie", color: "emerald", icon: "heart-pulse" },
  { name: "Financie", color: "amber", icon: "wallet" },
  { name: "Domov", color: "rose", icon: "house" },
  { name: "Učenie", color: "violet", icon: "graduation-cap" },
] as const;
