# Osobný task manažér — plán systému

> Stav: návrh k odsúhlaseniu · Verzia 1 · 2026-08-05

---

## 1. Čo to je

Osobný systém na riadenie **úloh** (deň / týždeň / mesiac) a **nápadov** (zachytenie → zrenie → povýšenie na projekt). Jeden používateľ, web + mobil, funguje offline.

### Základný tok

```
ZACHYTENIE  →  TRIEDENIE  →  PLÁNOVANIE  →  VYKONANIE  →  REVÍZIA
   Inbox      úloha/nápad/koš   deň/týždeň/mesiac   Dnes    týždenná/mesačná
```

### Dve pravidlá, na ktorých systém stojí

1. **Termín ≠ kedy to robím.** Každá úloha má `termín` (deadline) a `naplánované na` (deň, keď to reálne idem robiť). Bez tohto rozdelenia sa „Dnes" zaplní vecami s termínom o mesiac.
2. **Záväzky a možnosti sa nemiešajú.** Úlohy = musí sa spraviť. Nápady = mohlo by sa spraviť. Sú to dve rôzne entity s vlastným životným cyklom.

---

## 2. Technológie

| Vrstva | Voľba | Prečo |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | jedno repo pre web aj API, PWA out of the box |
| UI | Tailwind CSS + shadcn/ui | rýchle, prístupné komponenty, plná kontrola nad vzhľadom |
| Databáza | Neon Postgres + Drizzle ORM | free tier, typovo bezpečné migrácie |
| Lokálne dáta | Dexie (IndexedDB) | zdroj pravdy pre čítanie → appka je okamžitá a funguje offline |
| Sync | vlastný outbox + `/api/sync` | jeden používateľ ⇒ last-write-wins stačí, žiadny ťažký sync engine |
| Auth | Auth.js, Google login, allowlist na 1 e-mail | rovnaký účet ako kalendár |
| PWA | Serwist (service worker) + manifest | inštalovateľné na telefón |
| Hosting | Vercel | 0 € |
| Kalendár | Google Calendar API, scope `calendar.readonly` | len čítanie, podľa rozhodnutia |

**Náklady: 0 €/mesiac** (Vercel Hobby + Neon free tier).

### Ako funguje offline

- Každý záznam má `id` (UUID v7 generované na klientovi — funguje aj offline) a `updated_at`.
- Čítanie ide vždy z IndexedDB → UI je okamžité, bez spinnerov.
- Zápis ide do IndexedDB + do `outbox` fronty.
- Sync worker posiela outbox na `/api/sync` a sťahuje zmeny od posledného syncu.
- Konflikty: jeden používateľ ⇒ vyhráva novší `updated_at`. Mazanie je mäkké (`deleted_at`), aby sa nasyncovalo.

---

## 3. Dátový model

### `areas` — oblasti života
`id, name, color, icon, sort, archived_at`
Dlhodobé okruhy bez konca: práca, zdravie, financie, domov, učenie.

### `projects` — projekty
`id, area_id, name, goal, definition_of_done, status, deadline, sort, archived_at, created_at, updated_at`
`status`: `active` | `on_hold` | `done` | `dropped`

### `tasks` — úlohy
| Pole | Hodnoty / poznámka |
|---|---|
| `id, title, note` | základ |
| `status` | `inbox` → `todo` → `doing` → `waiting` → `done` / `dropped` |
| `priority` | 1 / 2 / 3 (viac stupňov nikto nepoužíva) |
| `due_date` | dokedy musí byť hotová |
| `planned_date` | ktorý deň to idem robiť |
| `horizon` | `day` / `week` / `month` / `someday` |
| `estimate_min` | 5 / 15 / 30 / 60 / 120 / 240 |
| `energy` | `low` / `mid` / `high` |
| `context` | `@pocitac`, `@telefon`, `@mesto`, `@doma` |
| `project_id`, `area_id` | zaradenie |
| `parent_task_id` | podúlohy |
| `recurrence_rule`, `recurrence_parent_id` | opakovanie (RRULE) |
| `postpone_count` | počítadlo odkladov — pohon anti-prokrastinácie |
| `sort` | poradie pri drag & drop |
| `completed_at, created_at, updated_at, deleted_at` | |

### `ideas` — nápady
| Pole | Hodnoty |
|---|---|
| `title, body` | |
| `stage` | `raw` → `incubating` → `promoted` / `rejected` / `faded` |
| `spark` | 1–5, ako veľmi ma to ťahá |
| `next_step` | najmenší možný ďalší krok |
| `last_touched_at` | pohon inkubátora a automatického zhnitia |
| `promoted_project_id` | keď sa z nápadu stane projekt |
| `area_id`, `created_at, updated_at, deleted_at` | |

### Podporné tabuľky
- `tags` + `taggables` — voľné tagy naprieč úlohami, nápadmi, projektmi
- `links (from_type, from_id, to_type, to_id)` — obojsmerné odkazy `[[...]]`
- `habits` + `habit_entries (habit_id, date, done)` — návyky a série
- `journal (date, body, mood)` — denník
- `reviews (type, period_start, period_end, payload, completed_at)` — uložené revízie
- `task_events (task_id, type, from, to, at)` — audit log; poháňa štatistiky, archív aj počítadlo odkladov

---

## 4. Obrazovky

| Obrazovka | Obsah |
|---|---|
| **Dnes** | žaba dňa + max 5–7 úloh + časová os (meetingy z kalendára) + rozpočet času |
| **Týždeň** | 7 stĺpcov, drag & drop, záťaž na deň s varovaním pri preplnení |
| **Mesiac** | kalendár + mesačné ciele + míľniky projektov |
| **Inbox** | nezatriedené zachytenia, cieľ = nula |
| **Projekty** | zoznam + detail (cieľ, definícia hotovo, úlohy, deadline) |
| **Oblasti** | prehľad okruhov života, koľko pozornosti dostávajú |
| **Nápady** | kanban podľa `stage`, filter podľa iskry, inkubátor |
| **Niekedy / Čaká sa na** | dva odkladacie zoznamy, riešia sa v týždennej revízii |
| **Návyky** | mriežka aktivity + série |
| **Štatistiky** | dokončené za týždeň, úspešnosť plánovania, rozdelenie podľa oblastí |
| **Revízie** | sprievodcovia: ráno / večer / týždeň / mesiac |
| **Archív** | história, fulltext, nič sa nemaže |

---

## 5. Rituály

| Rituál | Čas | Obsah |
|---|---|---|
| **Ranné plánovanie** | 3 min | vyber žabu + 3–5 úloh; systém navrhne podľa termínov, odkladov a voľného času |
| **Večerný shutdown** | 2 min | odškrtni hotové; pri každom nedokončenom rozhodni *presunúť / rozdeliť / zrušiť*; 1 veta do denníka |
| **Týždenná revízia** | 15 min | inbox na nulu → projekty → „čaká sa na" → 3 nápady z inkubátora → plán týždňa → prehľad dokončeného |
| **Mesačná revízia** | 30 min | ciele mesiaca, štatistiky, čo zrušiť, ktoré nápady povýšiť na projekt |

---

## 6. Vychytávky

### 6.1 Anti-prokrastinácia

**Počítadlo odkladov**
Presun `planned_date` dopredu pri nedokončenej úlohe zvýši `postpone_count`.
- 3 odklady → úloha sa vizuálne zvýrazní
- 5 odkladov → blokujúce okno: *„Toto si odložil 5×."* s troma tlačidlami: **Sprav to teraz** / **Rozdeľ na menšie** / **Zruš to**. Bez výberu sa okno nedá zavrieť.

**WIP limit**
V „Dnes" je strop N úloh (nastaviteľné, default 6). Pridanie ďalšej vyžaduje niečo odobrať.

**Rozpočet dňa**
`súčet estimate_min naplánovaných úloh + minúty meetingov z kalendára` vs. dostupné hodiny (nastavenie, napr. 8:00–18:00).
→ *„Naplánoval si 11 h práce na 6-hodinový deň."* Ukazuje sa hneď pri plánovaní, nie až večer.

### 6.2 Rýchle zachytenie + klávesnica

**Parsovanie prirodzeného jazyka po slovensky** — slovenské predložky rozlišujú oba dátumy:
```
zavolať Petrovi v piatok 15:00 !1 @telefon #praca +Klient-Novak 15m
                 ↑ planned_date

odovzdať priznanie do 31.3. !1 2h
                      ↑ due_date
```
| Vzor | Význam |
|---|---|
| `dnes`, `zajtra`, `pondelok`, `12.8.`, `o týždeň` | dátum |
| `v piatok`, `na zajtra` | `planned_date` |
| `do piatku`, `do 31.3.` | `due_date` |
| `15:00` | čas |
| `!1 !2 !3` | priorita |
| `@kontext` | kontext |
| `#tag` | tag |
| `+projekt` | projekt |
| `15m`, `2h` | odhad |

**Klávesnica**
`Ctrl+K` command palette · `n` nová úloha · `j/k` navigácia · `x` hotovo · `e` úprava · `1/2/3` priorita · `d` dátum · `t/w/m/i` prepínanie obrazoviek

> ⚠️ **Poznámka:** webová appka **nedokáže** zaregistrovať skutočnú globálnu klávesovú skratku mimo prehliadača. Riešenia: (a) PWA pripnutá na taskbar + skratka nastavená na `.lnk` súbore vo Windows, (b) neskôr tenký Tauri obal, ak to bude prekážať. V pláne je (a).

### 6.3 „Čo teraz?" navrhovač

Zadáš **dostupný čas** a **energiu** (voliteľne kontext) → systém vráti 3 konkrétne úlohy.

Filter: `estimate_min ≤ dostupný čas` ∧ `energy ≤ zadaná` ∧ `context ∈ dostupné` ∧ `planned_date ≤ dnes` alebo `horizon = day`
Poradie: po termíne → priorita → počet odkladov → vek úlohy

### 6.4 Návyky, série a štatistiky

- Opakované úlohy so sériami, mriežka aktivity v štýle GitHub contributions
- Cieľ „X× do týždňa" namiesto tvrdého „každý deň" — jedno vynechanie nezhodí sériu
- **Týždenný win report** — zoznam všetkého dokončeného
- Úspešnosť plánovania: koľko % naplánovaných úloh reálne dokončíš (kalibruje odhady)
- Rozdelenie pozornosti podľa oblastí — kde skutočne míňaš čas vs. kde chceš

### 6.5 Nápady

- **Inkubátor** — týždenná revízia vytiahne 3 nápady s `last_touched_at` starším ako 30 dní, vážené podľa `spark`: *„Toto ťa napadlo pred 4 mesiacmi. Stále aktuálne?"* → **Povýšiť na projekt** / **Nechať zrieť** / **Zahodiť**
- **Automatické zhnitie** — nápad nedotknutý 6 mesiacov dostane `stage = faded`. Nezmizne, len prestane rušiť; ostáva vo fulltexte.
- **Povýšenie na projekt** — jedno kliknutie: nápad → projekt + prvá úloha z `next_step`, s uchovaním prepojenia.

### 6.6 Ostatné

- **Šablóny** — opakujúce sa postupy (napr. „nový klient" = 8 úloh) na jedno kliknutie
- **Obojsmerné odkazy** `[[názov]]` medzi úlohami, nápadmi, projektmi, poznámkami + panel spätných odkazov
- **Kalendár (len čítanie)** — meetingy v dennom pláne, rátajú sa do rozpočtu času
- **Export** do Markdownu / JSON — žiadny lock-in
- **Archív** — nič sa nemaže natrvalo, plná história cez `task_events`

### 6.7 Čo zámerne NErobíme

5-stupňové priority · notifikačný spam · body, odznaky a levely · sledovanie času po sekundách · zdieľanie a tímové funkcie · AI, ktorá plánuje za teba.
Každá z týchto vecí pridá réžiu a po troch týždňoch systém opustíš.

---

## 7. Míľniky

| # | Míľnik | Obsah | Odhad |
|---|---|---|---|
| **M0** | Kostra | repo, Next.js, Drizzle schéma, Google login, deploy na Vercel | 1 večer |
| **M1** | **Denný driver** | úlohy CRUD, Inbox, Dnes, Týždeň, Mesiac, rýchle zachytenie s parsovaním, klávesové skratky | 3–4 večery |
| **M2** | Offline + mobil | Dexie mirror, outbox sync, service worker, manifest, inštalácia na telefón | 2–3 večery |
| **M3** | Štruktúra | projekty, oblasti, podúlohy, tagy, „Niekedy" a „Čaká sa na" — rozpis nižšie | 3–4 večery |
| **M4** | Nápady | entita nápadov, kanban zrenia, povýšenie na projekt, inkubátor, zhnitie | 2 večery |
| **M5** | Anti-prokrastinácia | počítadlo odkladov, WIP limit, rozpočet dňa, „Čo teraz?" | 2 večery |
| **M6** | Rituály | 4 sprievodcovia (ráno, večer, týždeň, mesiac) + denník | 3 večery |
| **M7** | Návyky a čísla | opakovanie, série, mriežka, štatistiky, win report | 2–3 večery |
| **M8** | Kalendár | Google Calendar read-only, meetingy v dennom pláne a v rozpočte | 1 večer |
| **M9** | Dolaďovanie | šablóny, `[[odkazy]]`, archív, export, fulltext | 2–3 večery |

**Po M1 systém reálne používaš.** Všetko ďalšie pribúda okolo živých dát, nie okolo prázdnej appky — to je zámer, lebo priority sa po týždni používania vždy zmenia.

---

## 7a. M3 — rozpis

Audit pred začiatkom (overené v kóde, nie odhad):

| Časť | Schéma | Rozhranie |
|---|---|---|
| Projekty | ✅ tabuľka | ❌ **nedá sa založiť** — nikde `insert(projects)` |
| Oblasti | ✅ tabuľka, 5 zo seedu | ❌ nedajú sa pridať ani premenovať |
| „Niekedy" | ✅ `horizon` | ❌ `getSomedayTasks` má **nula volajúcich** |
| „Čaká sa na" | ✅ stav `waiting` | ❌ žiadne |
| Podúlohy | ✅ `parentTaskId` | ❌ žiadne |
| Štítky | ✅ `tags`, `taggables`, zápis funguje | ⚠️ vidno len v náhľade pri písaní |

Dôsledok, ktorý plán nepredpokladal: **výber projektu v detaile úlohy je prázdny**
a `+projekt` v parseri nemá čo nájsť. Celá vetva projektov je mŕtva.

A druhý: úloha odložená v inboxe na „niekedy" tam ostane navždy, lebo nemá kam
odísť — inbox sa nikdy nedostane na nulu, čo je jeho jediný cieľ.

### Poradie a prečo práve takto

**1. Serverová vrstva ako prvá, celá naraz.**
Akcie a dotazy pre projekty, oblasti, podúlohy, štítky aj oba zoznamy. Všetky
obrazovky z nej potom čerpajú, takže keby vznikala po kúskoch, prepisovali by si
navzájom rozhrania. Rovnaká chyba, akú sme spravili v M1.

**2. Projekty a oblasti.**
Prvé zo všetkých obrazoviek, lebo na ne odkazuje zvyšok. Kým sa projekt nedá
založiť, je výber v detaile úlohy prázdny a používateľ nemá ako pochopiť, načo
tam to pole je.

**3. „Niekedy" a „Čaká sa na" spolu.**
Sú to dva zoznamy nad existujúcim filtrom — rovnaký tvar práce, spoločné
rozhodnutia o vzhľade. Robiť ich zvlášť by znamenalo dvakrát to isté.
Ten istý agent doplní aj navigáciu pre všetky nové obrazovky naraz, aby si
ju dvaja agenti neprepisovali.

**4. Podúlohy a štítky spolu.**
Oboje žije v detaile úlohy a v riadku úlohy — to sú tie isté dva súbory.
Rozdeliť ich medzi dvoch agentov by znamenalo konflikt na každom uložení.

### Odhad

3–4 večery namiesto pôvodných 2. Pôvodný odhad počítal s tým, že projekty
a oblasti len „napojíme" — nepočítal s tým, že ich celé rozhranie treba postaviť.

---

## 7b. M4 — rozpis

Audit pred začiatkom: tabuľka `ideas` je z M0 kompletne navrhnutá (stage, iskra,
`nextStep`, `lastTouchedAt`, väzba na projekt). **Kódu k nej je nula** — žiadna
serverová vrstva, žiadne obrazovky. M4 je teda čistá stavba na hotovom modeli,
bez migrácií.

### Rozhodnutia

**Zachytávanie: čip v rýchlom zachytení.** Tá istá klávesa `n` a ten istý dialóg,
len pribudne čip „Nápad", ktorý prepne cieľ uloženia. Využije svalovú pamäť aj
parser (oblasť, štítky). Nápad zapísaný v aute je celý zmysel — vlastná obrazovka
by ten moment nepokryla.

**Zobrazenie: kanban na počítači, zoznam na mobile.** Štyri stĺpce sa na 375 px
nezmestia. Je to dvojnásobok práce oproti samotnému zoznamu, ale zrenie nápadu
je vizuálna informácia a na šírke sa oplatí.

**Inkubátor: sekcia na `/napady`.** Pás „Vráť sa k týmto" s tromi nápadmi, ktorých
sa človek dlho nedotkol. Týždenná revízia v M6 potom siahne po tých istých dátach.

**Zhnitie sa nepočíta úlohou na pozadí.** Appka nemá cron a zavádzať ho kvôli
jednému príznaku je neúmerné — `faded` sa odvodí pri čítaní z `lastTouchedAt`.
Rovnaký výsledok, nulová infraštruktúra.

### Poradie

1. **Serverová vrstva celá naraz** — rovnako ako v M3. Stavané po kúskoch si
   agenti prepisujú rozhrania.
2. **Obrazovka nápadov** vrátane inkubátora a povýšenia na projekt. Povýšenie
   dáva zmysel až teraz, keď projekty od M3 existujú.
3. **Čip v zachytení** — malý zásah do hotového dialógu, ide zvlášť, aby
   nekolidoval s obrazovkou.

### Odhad

2–3 večery. Model je hotový, väčšina práce je rozhranie.

---

## 8. Otvorené otázky na neskôr

- Farebná schéma a vizuálny štýl (rozhodneme pri M1 na živých obrazovkách)
- Presné hodnoty: WIP limit, dostupné hodiny dňa, prahy odkladov (3/5) — nastaviteľné
- Či nápady chcú aj prílohy/obrázky
- Či bude treba Tauri obal kvôli globálnej skratke (rozhodne sa po pár týždňoch používania)
