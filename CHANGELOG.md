<p align="right"><b>SK</b> · <a href="#changelog">EN</a></p>

# Zoznam zmien

Všetky podstatné zmeny v projekte. Formát podľa
[Keep a Changelog](https://keepachangelog.com/sk/1.1.0/), verzie podľa
[Semantic Versioning](https://semver.org/lang/sk/).

## [Nevydané]

### Pribudlo

- **Claude (MCP)** — appka má vlastný MCP server s prihlásením cez OAuth.
  Claude na počítači, webe aj v mobile prečíta deň (úlohy, rozvrh, porady,
  udalosti, rozpočet času) a urobí s tebou ranný rituál. Pripojenie
  v Nastaveniach → Pripojené aplikácie, návod v [docs/MCP.md](docs/MCP.md).
- **Claude vie upravovať** — nielen vytvoriť a odškrtnúť: pri úlohe zmení
  názov, poznámku, termín, čas, odhad, prioritu, energiu, kontext, projekt,
  oblasť, predmet aj štítky; hotovú či zahodenú vráti späť. Udalosti, písomky
  a deadliny vytvorí aj upraví (deň, čas, miesto, zrušenie, známka).

### Zmenené

- **Rozvrh cez víkend** — od soboty sa otvorí už týždeň, ktorý príde, nie
  ten, čo práve skončil. Šípka späť ho stále ukáže.
- **Písomka ide za svojou hodinou** — keď sa v rozvrhu hodina predmetu
  presunie (suplovanie), stiahnutie rozvrhu posunie aj písomku.

### Opravené

- **Úprava písomky ju odpájala od hodiny** — stačilo ju v detaile
  premenovať a ostala s pevným časom: rozvrh ju už neposúval a rozpočet dňa
  ju rátal dvakrát (ako školu aj ako udalosť). Teraz ostáva na hodine, kým
  sa jej čas ručne nezmení.
- **Prečo zlyhalo stiahnutie rozvrhu** — pri chybe `502` je dôvod v logu
  aj v odpovedi cronu (chyba spojenia, stav a hlavičky odpovede, čo prišlo
  namiesto kalendára). Keď EduPage pošle HTML stránku namiesto kalendára,
  hláška to povie rovno, nie „v odbere nie je ani jedna hodina".

## [1.0.0] - 2026-09-27

Prvé verejné vydanie. Appka sa od augusta 2026 denne používa; toto je stav,
v ktorom si ju môže nasadiť aj niekto iný.

### Pribudlo

- **Úlohy s dvoma dátumami** — *naplánované na* (kedy to idem robiť) a *termín*
  (dokedy to musí byť hotové). Priorita, odhad času, energia, kontext, štítky,
  podúlohy, rozdelenie rozrobenej úlohy na hotové a zvyšok.
- **Dnes · Týždeň · Mesiac** — plán dňa s prioritou dňa, WIP limitom
  a rozpočtom času (úlohy, porady, škola a udalosti proti dostupným hodinám);
  týždeň s presúvaním a záťažou dní; mesiac ako súvislá mriežka s viacdňovými
  udalosťami ako pásmi.
- **Rýchle zachytenie** so slovenským parsovaním (`v piatok` vs. `do piatku`,
  čas, `!1`, `@kontext`, `#štítok`, `+projekt`, odhad, energia, školské slová),
  pravidlá, ktoré úlohe doplnia štítky, kontext či oblasť, a klávesnica
  s command paletou.
- **Inbox** ako triedička na jedno rozhodnutie naraz.
- **Projekty, oblasti, „Čaká sa na", „Niekedy"** — štruktúra nad úlohami.
- **Anti-prokrastinácia** — počítadlo odkladov s blokujúcim rozhodnutím,
  „Čo teraz?", ktoré ponúkne jednu úlohu podľa času a energie.
- **Rituály** — ranný plán, večerný shutdown s denníkom, týždenná a mesačná
  revízia so štatistikami a prehľadom dokončeného.
- **Návyky** so sériami na týždne a **opakované úlohy** (denne, dni v týždni,
  deň v mesiaci).
- **Nápady** — kanban zrenia, inkubátor, automatické zhnitie, povýšenie na
  projekt.
- **Učenie** — piliere, zručnosti, míľniky a lekcia z dokončenej úlohy.
- **Šablóny**, obojsmerné odkazy `[[…]]`, **archív** s vrátením
  a fulltextovým vyhľadávaním bez ohľadu na diakritiku, **export** všetkých
  dát do jedného JSON.
- **Školský rozvrh** — import z EduPage (Webcal), výber skupín, suplovanie
  z odberu aj ručne, prázdniny a štátne sviatky, úlohy a domáce úlohy pri
  hodinách, škola v rozpočte dňa.
- **Udalosti a deadliny** — písomky, skúšania, termíny, viacdňové udalosti;
  čas z rozvrhu, známka, návrh plánu prípravy na písomku, posun prípravy
  s udalosťou. Udalosti sú aj v exporte a vo vyhľadávaní.
- **Pripomienky** cez Web Push — úlohy s hodinou, udalosti (večer vopred,
  ráno, hodinu vopred) a dni prípravy; plánovač volá externý cron.
- **Google Kalendár** (len čítanie) — porady v pláne dňa a v rozpočte času.
- **Miesta** — kontext spojený s adresou; „som tu" podľa polohy nájde
  najbližšie miesto a jeho kontext. Poloha sa číta len na požiadanie.
- **PWA** — inštalácia na telefón, offline zachytenie cez frontu v prehliadači,
  naposledy načítané obrazovky bez signálu; voliteľné `.apk` (TWA).
- **Prihlásenie cez Google** so zoznamom povolených e-mailov
  (`ALLOWED_EMAILS`); viac ľudí na jednom nasadení, každý s vlastnými dátami.
- **Nasadenie** na Vercel + Neon + cron-job.org v bezplatných plánoch;
  migrácie dobehnú samy pri produkčnom nasadení a brána nepustí von kód,
  ktorému chýba migrácia. Návod v [docs/NASADENIE.md](docs/NASADENIE.md)
  a [docs/DEPLOY.md](docs/DEPLOY.md).
- **Licencia MIT.**

### Známe obmedzenia

- Rozhranie je len po slovensky.
- Stavané pre jedného človeka alebo pár ľudí zo zoznamu povolených e-mailov,
  nie ako verejná služba s registráciou.
- Automatická synchronizácia rozvrhu zvláda jedného človeka na nasadenie.
- Offline sa dá len zachytávať nové úlohy a prezerať naposledy načítané
  obrazovky; úpravy potrebujú pripojenie.

---

<p align="right"><a href="#zoznam-zmien">SK</a> · <b>EN</b></p>

# Changelog

All notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Claude (MCP)** — the app has its own MCP server with OAuth sign-in.
  Claude on desktop, web and mobile reads your day (tasks, timetable,
  meetings, events, time budget) and runs the morning routine with you.
  Connect under Nastavenia → Pripojené aplikácie; details in
  [docs/MCP.md](docs/MCP.md) (Slovak).
- **Claude can edit** — not just create and tick off: it changes a task's
  title, note, due date, time, estimate, priority, energy, context, project,
  area, subject and tags, and reopens done or dropped tasks. It creates and
  edits events, exams and deadlines (day, time, place, cancel, grade).

### Changed

- **Timetable on weekends** — from Saturday on, the timetable opens on the
  coming week instead of the one that just ended. The back arrow still
  shows it.
- **Exams follow their lesson** — when a subject's lesson moves in the
  timetable (a substitution), syncing the timetable moves the exam too.

### Fixed

- **Editing an exam detached it from its lesson** — just renaming it left
  it with a fixed time: the timetable no longer moved it and the day's time
  budget counted it twice (as school and as an event). It now stays on the
  lesson until its time is changed by hand.
- **Why the timetable download failed** — on a `502` the reason is in the
  log and in the cron response (connection error, response status and
  headers, what came instead of a calendar). When EduPage sends an HTML
  page instead of a calendar, the message says so instead of "no lessons
  in the feed".

## [1.0.0] - 2026-09-27

First public release. The app has been in daily use since August 2026; this
is the state in which someone else can deploy it too.

### Added

- **Tasks with two dates** — *planned for* (when I'll work on it) and *due*
  (when it must be done). Priority, time estimate, energy, context, tags,
  subtasks, splitting a half-done task into the done part and the rest.
- **Today · Week · Month** — a day plan with a priority of the day, a WIP
  limit and a time budget (tasks, meetings, school and events against the
  available hours); a week with drag & drop and daily load; a month grid with
  multi-day events as bars.
- **Quick capture** with Slovak natural-language parsing (`v piatok` vs.
  `do piatku`, time, `!1`, `@context`, `#tag`, `+project`, estimate, energy,
  school words), rules that fill in tags, context or area, and a
  keyboard-first UI with a command palette.
- **Inbox** as a one-decision-at-a-time triage.
- **Projects, areas, waiting for, someday.**
- **Anti-procrastination** — a postpone counter with a blocking decision, and
  "What now?", which offers a single task for your time and energy.
- **Rituals** — morning plan, evening shutdown with a journal, weekly and
  monthly reviews with statistics and a list of what got done.
- **Habits** with week-based streaks and **recurring tasks** (daily, weekdays,
  day of month).
- **Ideas** — a maturity kanban, an incubator, automatic fading, promotion to
  a project.
- **Learning** — pillars, skills, milestones and a lesson from a finished
  task.
- **Templates**, two-way `[[links]]`, an **archive** with restore and
  accent-insensitive full-text search, and a full **JSON export**.
- **School timetable** — EduPage (Webcal) import, class-group selection,
  substitutions from the feed or by hand, holidays and public holidays,
  homework attached to lessons, school time in the day budget.
- **Events and deadlines** — exams, oral exams, deadlines, multi-day events;
  times from the timetable, grades, a suggested exam-prep plan that moves with
  the event. Events are included in export and search.
- **Reminders** via Web Push — timed tasks, events (evening before, morning,
  an hour before) and prep days; the scheduler is called by an external cron.
- **Google Calendar** (read-only) — meetings in the day plan and time budget.
- **Places** — a context linked to an address; "I'm here" uses your location
  to find the nearest place and its context. Location is read only on request.
- **PWA** — installable on a phone, offline capture through an in-browser
  queue, recently loaded screens without signal; optional `.apk` (TWA).
- **Google sign-in** with an email allowlist (`ALLOWED_EMAILS`); several
  people per deployment, each with their own data.
- **Deployment** on Vercel + Neon + cron-job.org free tiers; migrations run
  automatically on production deploys and a gate blocks code whose migration
  hasn't been applied. Guides: [docs/DEPLOY.md](docs/DEPLOY.md) (English),
  [docs/NASADENIE.md](docs/NASADENIE.md) (Slovak).
- **MIT license.**

### Known limitations

- The UI is Slovak only.
- Built for one person or a few people on an allowlist, not as a public
  service with sign-up.
- Automatic timetable sync supports one person per deployment.
- Offline you can only capture new tasks and view recently loaded screens;
  edits need a connection.

[Nevydané]: https://github.com/Richinino/task-manager/compare/v1.0.0...HEAD
[Unreleased]: https://github.com/Richinino/task-manager/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Richinino/task-manager/releases/tag/v1.0.0
