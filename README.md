<p align="right"><b>SK</b> · <a href="#english">EN</a></p>

# Task manažér

Osobný systém na riadenie úloh (deň / týždeň / mesiac), udalostí a nápadov. Jeden používateľ, web + mobil, offline-first.

Návrh celého systému je v [PLAN.md](PLAN.md), záväzné rozhrania v [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

---

## Čo appka vie

| Časť | Čo tam je |
|---|---|
| **Dnes · Týždeň · Mesiac** | plán dňa s rozpočtom času, rozvrhom a udalosťami; týždeň a mesiac s viacdňovými udalosťami ako pásmi |
| **Inbox** | všetko zachytené, kým sa to neroztriedi — cieľ je nula |
| **Udalosti** | písomky, skúšania, termíny a iné udalosti a deadliny; príprava na písomku, známka, pripomienky |
| **Rozvrh** | import z EduPage, suplovanie, prázdniny, úlohy a písomky pri hodinách |
| **Projekty · Oblasti · Čaká sa na · Niekedy** | štruktúra nad úlohami |
| **Návyky · Opakované · Šablóny** | čo sa vracia pravidelne |
| **Učenie · Nápady · Archív** | piliere a zručnosti, doska nápadov, všetko hotové |
| **Pripomienky** | web push na telefón aj počítač — úlohy s hodinou, udalosti, dni prípravy |
| **Google Kalendár** | udalosti z kalendára v pláne dňa (len čítanie) |

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

Oba hovoria rovnakým dialektom, takže migrácie sú spoločné. Lokálne sa migrácie púšťajú automaticky pri štarte, v produkcii pri každom nasadení pred buildom.

```bash
npm run db:generate   # vygeneruje migráciu zo zmien v src/db/schema.ts
npm run db:migrate    # aplikuje migrácie ručne
npm run db:studio     # vizuálny prehliadač dát
npm run db:seed       # základné oblasti + ukážkové úlohy (idempotentné)
npm run db:reset      # zmaže lokálnu databázu
```

## Príkazy

```bash
npm run dev         # vývojový server
npm run build       # produkčný build (pri produkčnom nasadení na Verceli najprv migruje)
npm run typecheck   # tsc --noEmit
npm run test        # vitest (čisté funkcie v src/lib)
npm run overit      # všetko naraz: preklad, testy, lint, kontrola dopytov a dizajnu
npm run lint        # eslint
```

## Nasadenie

Vercel + Neon + Google + cron-job.org, všetko v bezplatných plánoch — na
vlastných účtoch si appku rozbehne ktokoľvek. Postup krok za krokom aj riešenie
častých problémov je v [docs/NASADENIE.md](docs/NASADENIE.md), anglicky
v [docs/DEPLOY.md](docs/DEPLOY.md).

Čo pribudlo v ktorej verzii, je v [CHANGELOG.md](CHANGELOG.md); ako nahlásiť
chybu alebo poslať zmenu, v [CONTRIBUTING.md](CONTRIBUTING.md).

## Klávesové skratky

| Skratka | Akcia |
|---|---|
| `n` | rýchle zachytenie |
| `Ctrl` `K` | command palette |
| `t` / `w` / `m` / `d` / `i` | Dnes / Týždeň / Mesiac / Udalosti / Inbox |
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

Školské slová:

```
písomka z fyziky v piatok
```

| Zápis | Čo vznikne |
|---|---|
| `písomka`, `test`, `previerka`, `skúška` | **udalosť** písomka — deň a hodinu doplní rozvrh |
| `skúšanie`, `ústne skúšanie` | **udalosť** skúšanie |
| `DU`, `domáca úloha` | úloha — domáca úloha |
| `učiť sa`, `zopakovať` | úloha — príprava (učenie / opakovanie) |
| `FYZ`, `z fyziky` | predmet podľa skratky alebo názvu z rozvrhu |

Ostatné udalosti a deadliny (lekár, výlet, odovzdať referát) sa volia
prepínačom **Úloha · Udalosť · Deadline** priamo v zachytení. Prečo to nie je
slovo „do", je v [docs/UDALOSTI.md](docs/UDALOSTI.md).

## Technológie

Next.js 16 (App Router) · React 19 · TypeScript 6 · Tailwind CSS 4 · Drizzle ORM · Postgres / PGlite · Auth.js v5 · Web Push · Vitest

## Stav

| Míľnik | Stav |
|---|---|
| M0–M9 — od kostry po šablóny, odkazy, archív a export | hotové |
| Školský rozvrh — import z EduPage, suplovanie, prázdniny, úlohy k predmetom | hotové |
| Učenie — piliere, zručnosti, míľniky, lekcia z dokončenej úlohy | hotové |
| Udalosti a deadliny — písomky, viacdňové udalosti, príprava na písomku, pripomienky, hľadanie a export | hotové |

**Všetko je nasadené a používa sa.** Rozpis míľnikov aj rozhodnutia za nimi sú
v [PLAN.md](PLAN.md). Podprojekty majú vlastné dokumenty:
[docs/ROZVRH.md](docs/ROZVRH.md) (školský rozvrh) a
[docs/UDALOSTI.md](docs/UDALOSTI.md) (udalosti a deadliny).

Čo ešte nie je hotové, je v PLAN.md v sekcii **Čo zostáva**.

## Licencia

[MIT](LICENSE) — appku si môžeš nasadiť, upraviť aj šíriť ďalej, len nechaj
v kópii pôvodné upozornenie o autorských právach.

---

# English

<p align="right"><a href="#task-manažér">SK</a> · <b>EN</b></p>

A personal system for managing tasks (day / week / month), events and ideas. Single user, web + mobile, offline-first.

The app itself is in Slovak. The overall design lives in [PLAN.md](PLAN.md) and the binding interfaces in [docs/CONVENTIONS.md](docs/CONVENTIONS.md) (both in Slovak).

## What it does

| Area | What's there |
|---|---|
| **Today · Week · Month** | a day plan with a time budget, the school timetable and events; week and month show multi-day events as bars |
| **Inbox** | everything captured until it's sorted — the goal is zero |
| **Events** | exams, oral exams, deadlines and other events; exam prep, grades, reminders |
| **Timetable** | EduPage import, substitutions, holidays, homework and exams attached to lessons |
| **Projects · Areas · Waiting for · Someday** | structure above tasks |
| **Habits · Recurring · Templates** | what comes back on a schedule |
| **Learning · Ideas · Archive** | pillars and skills, an idea board, everything done |
| **Reminders** | web push to phone and desktop — timed tasks, events, prep days |
| **Google Calendar** | calendar events in the day plan (read-only) |

## Getting started

You need **Node.js 24** (also pinned in `.nvmrc`). With Node 22 and npm 10,
`npm ci` fails with "lock file not in sync" — the lockfile comes from npm 11.

```bash
cp .env.example .env.local    # Windows: copy .env.example .env.local
npm ci
npm run db:seed
npm run dev
```

Open http://localhost:3000 and sign in with the **Pokračovať vo vývojovom režime** (continue in development mode) button.

`.env.local` is not in git. Without it, a fresh checkout (new computer, new
cloud) **doesn't show** the sign-in button at all — development sign-in is
enabled by `AUTH_DEV_BYPASS=1` from `.env.example`. Google sign-in is not
needed for local development; how to enable it is described in
[docs/DEPLOY.md](docs/DEPLOY.md).

## Database

| Environment | Engine | Setup |
|---|---|---|
| local | PGlite (embedded Postgres in `.data/`) | none — leave `DATABASE_URL` empty |
| production | Neon / any Postgres | `DATABASE_URL` |

Both speak the same dialect, so migrations are shared. Locally they run automatically on startup; in production on every deploy, before the build.

```bash
npm run db:generate   # generate a migration from changes in src/db/schema.ts
npm run db:migrate    # apply migrations manually
npm run db:studio     # visual data browser
npm run db:seed       # default areas + sample tasks (idempotent)
npm run db:reset      # delete the local database
```

## Commands

```bash
npm run dev         # development server
npm run build       # production build (on a Vercel production deploy it migrates first)
npm run typecheck   # tsc --noEmit
npm run test        # vitest (pure functions in src/lib)
npm run overit      # everything at once: typecheck, tests, lint, query and design checks
npm run lint        # eslint
```

## Self-hosting

Vercel + Neon + Google + cron-job.org, all on free plans — anyone can run their
own copy on their own accounts. The step-by-step guide is
[docs/DEPLOY.md](docs/DEPLOY.md); the more detailed Slovak one, with
troubleshooting, is [docs/NASADENIE.md](docs/NASADENIE.md).

Known limitations: the UI is Slovak only, and the app is built for one person
(or a few people on an email allowlist, `ALLOWED_EMAILS`), not as a public
multi-user service. The school timetable import targets Slovak schools on
EduPage.

Release history is in [CHANGELOG.md](CHANGELOG.md); how to report a bug or
send a change is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `n` | quick capture |
| `Ctrl` `K` | command palette |
| `t` / `w` / `m` / `d` / `i` | Today / Week / Month / Events / Inbox |
| other letters | other screens — each item in the sidebar shows its shortcut |
| `Ctrl` `Z` | undo a just-discarded task (while the toast is visible) |

In the inbox:

| Shortcut | Action |
|---|---|
| `j` / `k` | move through the list |
| `1`–`4` | today / tomorrow / this week / someday |
| `x` | done |
| `⌫` | discard |

## Quick capture syntax

Capture is typed in Slovak:

```
zavolať Petrovi v piatok 15:00 !1 @telefon +Klient-Novak 15m
```

(*call Peter on Friday 15:00, priority 1, context phone, project Klient-Novak, 15 minutes*)

| Syntax | Meaning |
|---|---|
| `v piatok`, `na zajtra`, `zajtra`, `12.8.` | **planned for** — when I'm going to work on it |
| `do piatku`, `do 31.3.` | **due** — when it has to be done |
| `15:00` | time |
| `!1` `!2` `!3` | priority |
| `@pocitac` | context |
| `#tag` | tag |
| `+projekt` | project |
| `30m`, `2h`, `1,5h` | time estimate |
| `!!nizka` `!!stredna` `!!vysoka` | energy (low / medium / high) |

The difference between *"v piatok"* (on Friday) and *"do piatku"* (by Friday) is the core of the whole system — a deadline is not the same as the day I plan to work on it.

School words:

```
písomka z fyziky v piatok
```

(*physics exam on Friday*)

| Syntax | What it creates |
|---|---|
| `písomka`, `test`, `previerka`, `skúška` | an exam **event** — the timetable fills in the day and period |
| `skúšanie`, `ústne skúšanie` | an oral exam **event** |
| `DU`, `domáca úloha` | a task — homework |
| `učiť sa`, `zopakovať` | a task — prep (study / review) |
| `FYZ`, `z fyziky` | the subject, by its timetable abbreviation or name |

Other events and deadlines (doctor, school trip, hand in an essay) are chosen
with the **Task · Event · Deadline** switch right in capture. Why the word
"do" doesn't create one is explained in [docs/UDALOSTI.md](docs/UDALOSTI.md).

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript 6 · Tailwind CSS 4 · Drizzle ORM · Postgres / PGlite · Auth.js v5 · Web Push · Vitest

## Status

| Milestone | Status |
|---|---|
| M0–M9 — from the skeleton to templates, links, archive and export | done |
| School timetable — EduPage import, substitutions, holidays, tasks per subject | done |
| Learning — pillars, skills, milestones, a lesson from a finished task | done |
| Events and deadlines — exams, multi-day events, exam prep, reminders, search and export | done |

**Everything is deployed and in daily use.** The milestone breakdown and the
decisions behind it are in [PLAN.md](PLAN.md). Sub-projects have their own
documents: [docs/ROZVRH.md](docs/ROZVRH.md) (school timetable) and
[docs/UDALOSTI.md](docs/UDALOSTI.md) (events and deadlines).

What's still missing is listed in PLAN.md under **Čo zostáva** (what's left).

## License

[MIT](LICENSE) — you may run, modify and redistribute the app; just keep the
original copyright notice in your copy.
