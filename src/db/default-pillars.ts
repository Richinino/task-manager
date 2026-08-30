/**
 * Piliere učenia, ktoré appka ponúkne, keď je sekcia prázdna.
 *
 * **Ponúkne, nezaloží.** Na rozdiel od oblastí sa tieto nevytvárajú pri prvom
 * prihlásení: oblasti musia existovať, inak sa nemá k čomu priradiť okruh a
 * appka je nefunkčná. Piliere sú osobné — kto sa nechce učiť nič, nemá mať
 * v appke štyri prázdne priehradky, ktoré musí najprv pomazať.
 *
 * ## Prečo práve tieto štyri
 *
 * Pilier je **doména**, teda o úroveň vyššie než zručnosť: lockpicking patrí
 * pod Ruky, píšťalka pod Hudbu, SQL pod Techniku. Keby boli piliere na úrovni
 * zručností, dostali by sme zoznam zručností napísaný dvakrát a rozdelenie
 * v analýze by nepovedalo nič.
 *
 * Štyri, nie desať. Prázdny pilier je v prehľade užitočný údaj („Telo 0" je
 * fakt, nie výčitka), ale desať prázdnych je len šum. Piaty sa pridá vtedy,
 * keď prvá lekcia nebude mať kam padnúť — to je lepší signál než hádanie
 * dopredu.
 */
export const DEFAULT_PILLARS = [
  { name: "Technika", color: "indigo" },
  { name: "Ruky", color: "amber" },
  { name: "Hudba", color: "violet" },
  { name: "Telo", color: "emerald" },
] as const;
