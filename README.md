# Task manažér

Osobný systém na riadenie úloh (deň / týždeň / mesiac) a nápadov. Jeden používateľ, web + mobil, offline-first.

Návrh celého systému je v [PLAN.md](PLAN.md), záväzné rozhrania v [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

---

## Spustenie

```bash
npm install
npm run db:seed
npm run dev
```

Otvor http://localhost:3000 a prihlás sa tlačidlom **Pokračovať vo vývojovom režime**.

Google prihlásenie nie je na lokálny vývoj potrebné — `.env.local` má `AUTH_DEV_BYPASS=1`. Ako ho zapnúť, je popísané v [docs/NASADENIE.md](docs/NASADENIE.md).

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
npm run test        # vitest (parser a dátumy)
npm run lint        # eslint
```

## Klávesové skratky

| Skratka | Akcia |
|---|---|
| `n` | rýchle zachytenie |
| `Ctrl` `K` | command palette |
| `t` / `w` / `m` / `i` | Dnes / Týždeň / Mesiac / Inbox |
| `j` / `k` | pohyb v zozname |
| `x` | odškrtnúť |
| `1`–`4` | triedenie v inboxe |

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
| M0 — kostra, schéma, auth, seed | hotové |
| M1 — vrstvy: parser, dátumy, dotazy, akcie, UI primitívy, shell | hotové |
| M1 — obrazovky: Dnes, Týždeň, Mesiac, Inbox, zachytenie, klávesnica | hotové |
| M1 — adversariálna revízia | **nedokončená** |
| M2 — offline + PWA | ďalšie na rade |
| M3–M9 | viď [PLAN.md](PLAN.md) |

> Appka sa dá spustiť a všetky obrazovky existujú. Build, testy aj typecheck prechádzajú.
> Neprebehla ale ešte revízia (časové pásma, parser na hraničných vstupoch, prístupnosť)
> ani manuálne preklikanie v prehliadači — počítaj s tým, že drobné chyby tam byť môžu.

---

## Poznámka k OneDrive

Projekt leží v OneDrive. `node_modules` a `.data` sa synchronizovať nemajú — spomaľuje to buildy a OneDrive vie počas inštalácie zamknúť súbory. Vylúč ich:

```bash
attrib +U -P /s "node_modules" ".data"
```

Prípadne v nastaveniach OneDrive → Zálohovanie → Vybrať priečinky odškrtni tento projekt a nechaj si ho zálohovať cez git.
