# Stavba, krok 2: zvyšok telefónu presne podľa návrhu

Používateľ si pozrel krok 1 a povedal jasne: **má to vyzerať presne ako
v artefakte** — farebnosť, živosť, plochy vo farbe oblasti. Plán a Inbox
v kroku 1 vôbec nevyzerali ako návrh. Toto je oprava.

**Predloha je záväzná, nie inšpirácia.** Statické ukážky:
`docs/dizajn-android/c-plan.html` (Týždeň, Mesiac, Projekt),
`c-struktura.html` (Inbox, Knižnica, Detail úlohy), `variant-c.html` (Dnes,
zachytenie). Otvor príslušný súbor a prenes rozloženie, rozmery, polomery,
veľkosti písma, texty a farby čo najvernejšie. Kde predloha ukazuje farebnú
plochu, appka ju má mať tiež.

## Pravidlá (platia aj všetky zo `STAVBA-KROK1.md`)

- Len telefón: nové komponenty sú `md:hidden`, pôvodné stromy dostanú
  `hidden md:block` (alebo `md:flex`). **Počítač sa nesmie zmeniť.**
- Farby oblasti: `areaColorValue(area.color)` z `components/task/area-dot`.
  Plocha vo farbe oblasti má biely text. Bez oblasti: farba predmetu (ak je
  to školská úloha a predmet má farbu), inak plná čierna plocha
  `bg-accent text-accent-fg` — **nikdy nie sivá**, sivá zabila živosť.
- Priorita dňa: `bg-frog-fill text-on-frog`. Po termíne: `text-danger`.
- Nadpisy v kartách a hlavičkách: trieda `font-display` (Archivo 125 %, 800).
- Polomery z predlohy: veľké karty a hlavičky `rounded-[22px]`, menšie
  karty `rounded-[18px]`, tlačidlá `rounded-[14px]`, čipy `rounded-full`.
  (Kontrola dizajnu tieto hodnoty pustí; ak nie, pridaj token, nie výnimku.)
- Ploché plochy, žiadne tiene okrem tých, ktoré má predloha.
- Texty presne z predlohy, kde sedia na skutočné dáta; inak v jej tóne.
- Preplnený deň sa povie pokojne, bez červenej („o 30 min viac, než sa
  zmestí").
- Všetka logika (počty, kapacita dňa, poradie) do `src/lib/` s testom.
- Overenie na konci: `npm run overit` musí skončiť kódom 0. Necommituj.
  Dev server nespúšťaj — beží na porte 3100 a vizuálne kontrolujem ja.
