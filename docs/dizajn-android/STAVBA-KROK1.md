# Stavba, krok 1: kostra a Dnes v smere „Jedna karta"

Používateľ si vybral smer C (`variant-c.html`, `c.html`, `c-*.html` v tomto
priečinku) a všetky tri spôsoby časovej osi naraz. Krok 1 mení **len telefón**
(pod breakpointom `md`). Počítač ostáva v dizajne „Terminál" bez zmeny.

## Záväzné pre všetkých

- Pred písaním kódu si prečítaj `AGENTS.md` (Next.js 16 sa líši od toho, čo
  poznáš — pozri `node_modules/next/dist/docs/`, ak siahaš na routing,
  `next/font` alebo serverové akcie) a `docs/CONVENTIONS.md`.
- UI texty a komentáre po slovensky, kód po anglicky. Úvodzovky „…".
  Skloňovanie cez `pluralSk`/`countSk` z `src/lib/sk.ts`.
- Farby len cez tokeny (`bg-bg`, `text-fg-muted`, …). Nové tokeny pozri nižšie.
  Žiadne `text-[13px]`; veľkosti `text-micro|mini|meta|body|row|hero`.
  Nová veľkosť patrí aj do `extendTailwindMerge` v `src/lib/utils.ts`.
- Dotykové ciele min 44 px. Ikony `lucide-react`. Ikonové tlačidlá majú
  `aria-label`. Klávesnica musí všetko dosiahnuť.
- Čistá logika patrí do `src/lib/` s testom `*.test.ts` vedľa (vitest,
  prostredie node). Komponenty sa netestujú.
- Zdieľané pomôcky NIKDY neexportuj z modulu s `"use client"`.
- Overenie: `npm run overit` (MUSÍ skončiť kódom 0). Nepoužívaj `| tail`
  za príkazom, ktorého návratový kód rozhoduje.
- Necommituj. Neťahaj nič z `src/server/queries/calendar.ts`,
  `src/server/actions/calendar.ts` ani `google-tokens` okrem volania
  existujúcich funkcií — na kalendári pracuje iná session.
- Dotýkaj sa len súborov, ktoré ti zadanie pridelí, plus nových súborov
  v tebe pridelených priečinkoch.

## Tokeny telefónu (robí agent „Kostra")

V `src/app/globals.css` sa pod `@media (max-width: 767.98px)` prepíšu
existujúce tokeny na paletu C — svetlá (`:root`) aj tmavá (`.dark`):

| token | svetlá | tmavá |
|---|---|---|
| --bg | #f7f7f9 | #0f0f13 |
| --surface | #ffffff | #1a1a21 |
| --surface-2 | #ececf1 | #24242d |
| --border | #e2e2e8 | #2a2a33 |
| --border-strong | #cfcfd8 | #3a3a45 |
| --fg | #141419 | #f2f2f6 |
| --fg-muted | #55555f | #a9a9b6 |
| --fg-subtle | #8e8e99 | #6c6c78 |
| --accent | #141419 | #f2f2f6 |
| --accent-fg | #ffffff | #0f0f13 |
| --accent-soft | #ececf1 | #24242d |
| --accent-badge | rgba(20,20,25,.10) | rgba(242,242,246,.14) |
| --frog | #a86f08 (text) | #f0b544 |
| --success | #1f8a5f | #4cc38d |
| --danger | #d23b2c | #f08272 |

Nové tokeny (definované VŠADE, nielen na telefóne, aby triedy existovali;
na počítači ich zatiaľ nič nepoužíva):
`--frog-fill` (#d9971c / #f0b544) — výplň karty priority dňa,
`--on-frog` (#1d1405 / #1d1405) — text na nej,
`--font-display` — Archivo v rozšírenom reze.
Tailwind: `bg-frog-fill`, `text-on-frog`, `font-display`.

Písmo: `next/font/google` `Archivo` s osami `wdth` (premenná `--font-archivo`,
subsets latin + latin-ext). Na telefóne `--font-sans` aj `--font-mono` =
Archivo (smer C má jedno písmo; čísla nesie `tabular-nums`). Nadpisy kariet:
trieda `font-display` = Archivo s `font-stretch: 125%` a váhou 800.

## Navigácia telefónu

Spodná lišta: **Dnes · Plán · + · Inbox · Knižnica**.
- Plán → `/tyzden`; aktívny aj na `/mesiac`, `/udalosti`, `/rozvrh`.
  Na tých štyroch stránkach je na telefóne navrchu prepínač
  „Týždeň | Mesiac | Udalosti | Rozvrh" (odkazy, `md:hidden`).
- „+" = `openCapture()` z `useCapture()`. Plávajúce tlačidlo zmizne.
- Knižnica → nová cesta `/kniznica`: projekty (vodorovný pás kariet vo farbe
  oblasti s postupom), dlaždice Oblasti/Návyky/Učenie, zoznam Nápady, Niekedy,
  Čaká sa na, Opakované, Šablóny, Archív, Nastavenia; prepínač témy
  a odhlásenie (presťahujú sa sem z mobilnej hlavičky). Aktívna aj na
  všetkých cestách, ktoré do nej patria.
- Hárok „Viac" a mobilná hlavička „Task manažér" zaniknú.

## Časová os (robí agent „Os")

`src/lib/day-timeline.ts` — čistá funkcia rozloženia dňa, ktorú používa Dnes
(pravítko + rozbalená os) aj zachytenie (miesto pre novú úlohu).
Detaily sú v zadaní agenta.
