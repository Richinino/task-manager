# Task manažér

Osobný systém na riadenie úloh (deň / týždeň / mesiac) a nápadov. Jeden používateľ, web + mobil, offline-first.

Návrh celého systému je v [PLAN.md](PLAN.md), záväzné rozhrania v [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

---

## Spustenie

Potrebuješ **Node.js 24** (verzia je aj v `.nvmrc`). S Node 22 a npm 10
`npm ci` padá na „lock file not in sync" — lockfile je z npm 11.

```bash
cp .env.example .env.local    # Windows: copy .env.example .env.local
npm ci
npm run db:seed
npm run dev
```

Otvor http://localhost:3000 a prihlás sa tlačidlom **Pokračovať vo vývojovom režime**.

`.env.local` nie je v gite. Bez neho sa na čistej kópii (nový počítač, nový
cloud) tlačidlo prihlásenia **nezobrazí vôbec** — vývojové prihlásenie
zapína práve `AUTH_DEV_BYPASS=1` z `.env.example`. Google prihlásenie na
lokálny vývoj potrebné nie je; ako ho zapnúť, je v
[docs/NASADENIE.md](docs/NASADENIE.md).

## Databáza

| Prostredie | Motor | Nastavenie |
|---|---|---|
| lokálne | PGlite (vstavaný Postgres v `.data/`) | žiadne — `DATABASE_URL` nechaj prázdne |
| produkcia | Neon / ľubovoľný Postgres | `DATABASE_URL` |

Oba hovoria rovnakým dialektom, takže migrácie sú spoločné. Lokálne sa migrácie púšťajú automaticky pri štarte.

```bash
npm run db:generate   # vygeneruje migráciu zo zmien v src/db/schema.ts
npm run db:migrate    # aplikuje migrácie (produkcia)
npm run db:studio     # vizuálny prehliadač dát
npm run db:seed       # základné oblasti + ukážkové úlohy (idempotentné)
npm run db:reset      # zmaže lokálnu databázu
```

## Príkazy

```bash
npm run dev         # vývojový server
npm run build       # produkčný build
npm run typecheck   # tsc --noEmit
npm run test        # vitest (čisté funkcie v src/lib)
npm run overit      # všetko naraz: preklad, testy, lint, kontrola dopytov a dizajnu
npm run lint        # eslint
```

## Klávesové skratky

| Skratka | Akcia |
|---|---|
| `n` | rýchle zachytenie |
| `Ctrl` `K` | command palette |
| `t` / `w` / `m` / `i` | Dnes / Týždeň / Mesiac / Inbox |
| ďalšie písmená | ostatné obrazovky — skratka je vypísaná pri každej položke v bočnom paneli |
| `Ctrl` `Z` | vrátiť práve zahodenú úlohu (kým svieti hláška) |

V inboxe navyše:

| Skratka | Akcia |
|---|---|
| `j` / `k` | pohyb v zozname |
| `1`–`4` | dnes / zajtra / tento týždeň / niekedy |
| `x` | hotovo |
| `⌫` | zahodiť |

## Syntax rýchleho zachytenia

```
zavolať Petrovi v piatok 15:00 !1 @telefon +Klient-Novak 15m
```

| Zápis | Význam |
|---|---|
| `v piatok`, `na zajtra`, `zajtra`, `12.8.` | **naplánované na** — kedy to idem robiť |
| `do piatku`, `do 31.3.` | **termín** — dokedy to musí byť hotové |
| `15:00` | čas |
| `!1` `!2` `!3` | priorita |
| `@pocitac` | kontext |
| `#tag` | tag |
| `+projekt` | projekt |
| `30m`, `2h`, `1,5h` | odhad času |
| `!!nizka` `!!stredna` `!!vysoka` | energia |

Rozdiel medzi *„v piatok"* a *„do piatku"* je jadro celého systému — termín nie je to isté ako deň, keď na tom idem robiť.

## Technológie

Next.js 16 (App Router) · React 19 · TypeScript 6 · Tailwind CSS 4 · Drizzle ORM · Postgres / PGlite · Auth.js v5 · Vitest

## Stav

| Míľnik | Stav |
|---|---|
| M0–M9 — od kostry po šablóny, odkazy, archív a export | hotové |
| Školský rozvrh — import z EduPage, suplovanie, prázdniny, úlohy k predmetom | hotové |
| Učenie — piliere, zručnosti, míľniky, lekcia z dokončenej úlohy | hotové |

**Všetko je nasadené a používa sa.** Rozpis míľnikov aj rozhodnutia za nimi sú
v [PLAN.md](PLAN.md), školský rozvrh má vlastný dokument
[docs/ROZVRH.md](docs/ROZVRH.md).

Čo ešte nie je hotové, je v PLAN.md v sekcii **Čo zostáva**.

---

## Poznámka k OneDrive

Projekt leží v OneDrive. `node_modules` a `.data` sa synchronizovať nemajú — spomaľuje to buildy a OneDrive vie počas inštalácie zamknúť súbory. Vylúč ich:

```bash
attrib +U -P /s "node_modules" ".data"
```

Prípadne v nastaveniach OneDrive → Zálohovanie → Vybrať priečinky odškrtni tento projekt a nechaj si ho zálohovať cez git.
