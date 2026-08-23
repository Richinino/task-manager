# Konvencie projektu

Záväzné rozhrania, na ktorých stoja všetky moduly. Kto mení tento súbor, mení kontrakt — rob to vedome.

## Prostredie

Next.js 16.3 (App Router, Turbopack) · React 19.2 · TypeScript 6 (`strict`, `noUncheckedIndexedAccess`) · Tailwind CSS 4.3 · Drizzle 0.45 · Zod 4 · Auth.js v5 beta.

- Alias `@/*` → `./src/*`
- Jazyk UI a komentárov: **slovenčina**. Kód, názvy premenných a súborov: **angličtina**.
- Súbory: `kebab-case.tsx`. Komponenty: `PascalCase`. Funkcie: `camelCase`.
- `noUncheckedIndexedAccess` je zapnuté — indexovanie poľa vracia `T | undefined`. Používaj `arr[i]!` len tam, kde je to preukázateľne bezpečné.

### Overovanie

```
npm run overit
```

Spustí preklad, testy, lint, kontrolu dopytov a kontrolu dizajnu v tomto
poradí a zastaví sa na prvom neúspechu. **Používaj tento príkaz, nie jednotlivé kroky v rúre** —
`npx tsc --noEmit | tail -3 && …` vracia návratový kód `tail`, nie `tsc`,
takže chyba prekladu prejde tichom. Presne tak sa raz do repozitára dostal
commit, ktorý sa nepreložil.

Vizuálnu regresiu nechytí ani jeden z týchto krokov. Po nich vždy nasleduje
**naozajstné klikanie v prehliadači** — syntetické `.click()` tu opakovane
tíško zlyhalo.

### Oddelenie používateľov

`npm run kontrola:dopyty` je **brána**, nie prehľad: pri náleze vracia
nenulový kód a `npm run overit` na ňom zastane. Kontroluje jediný invariant,
na ktorom stojí to, že appku môžu používať dvaja ľudia — každý dopyt nad
tabuľkou, ktorá patrí človeku, musí mať vo svojom príkaze filter.

**Drizzle sa dá pýtať dvoma spôsobmi a každý ho píše inak:**

```ts
db.select().from(tasks).where(eq(tasks.userId, id))   // staviteľ → .where(
db.query.tasks.findMany({ where: eq(tasks.userId, id) })  // relačné API → where:
```

Kontrola pozná oba. Keby poznala len prvý — a chvíľu ho poznala len ten —
strážila by menej, než tvrdí, a to je horšie než keby nebola: dáva falošnú
istotu. Do zoznamu patrí aj samotná tabuľka `users`; `.from(users)` bez
filtra vypíše všetkých.

Preklad to nechytí (`db.select().from(tasks)` je typovo v poriadku, len vráti
aj cudzie riadky) a testy tiež nie (sú na čisté funkcie, bez databázy).

Tabuľky bez vlastného `userId` — `habitEntries`, `taggables`, `subtasks` —
sa filtrujú cez `innerJoin` na vlastniacu tabuľku. Aj to je `.where(`, takže
pravidlo platí rovnako.

Vedomá výnimka sa označuje komentárom nad riadkom:

```ts
// bez-filtra: <dôvod, prečo je to v poriadku>
```

### Prístupnosť v linte

Zapnutá je celá odporúčaná sada `jsx-a11y`, nie iba šesť pravidiel, ktoré
dáva `eslint-config-next`. Plugin registruje `eslint-config-next`, takže sa
v `eslint.config.mjs` preberajú **len pravidlá** — vyhlásiť ho znova sa nedá.

Dve výnimky, ktoré sú v tejto appke zámerné:

- **`autoFocus`** smie byť iba v niečom, čo sa objaví **po výslovnom kroku
  človeka** (dialóg, pole otvorené tlačidlom). Pravidlo mieri na zaostrenie
  pri načítaní stránky, ktoré človeka odhodí z miesta, kde bol.
- **Poslucháč na neinteraktívnom prvku** je v poriadku, keď len POZORUJE, čo
  sa deje v prvkoch vnútri (napr. riadok inboxu si takto značí, kam mieria
  skratky). Pasca „klikom to ide, klávesnicou nie" tým nevzniká.

Obe sú v kóde označené `eslint-disable-next-line` s dôvodom, nie vypnuté
globálne — pravidlo tak ďalej stráži nový kód.

### Úvodzovky

Slovenská dvojica je **`„…“`** — dole otváracia, hore zatváracia. Strojopisné
`"` v texte appky nepatria.

Chytajú sa dve rôzne siete, lebo ani jedna nevidí celok:

- `react/no-unescaped-entities` v ESLinte vidí **text v JSX**,
- pravidlo v `npm run kontrola:dizajn` vidí **reťazce s dosadenou hodnotou**
  (`aria-label`, hlášky, chybové vety).

Komentáre sa nekontrolujú a nemusia sa opravovať — nikto ich nevykresľuje.

## Štruktúra

```
src/
  app/
    (app)/            ← prihlásená časť, layout obsahuje shell
      layout.tsx
      dnes/ tyzden/ mesiac/ inbox/
    prihlasenie/
    api/auth/[...nextauth]/
  components/
    ui/               ← primitívy (button, input, dialog, …)
    shell/            ← sidebar, mobilná navigácia, prepínač témy
    task/             ← zdieľané zobrazenie úlohy
    views/            ← komponenty jednotlivých obrazoviek
    capture/          ← rýchle zachytenie
    command/          ← Ctrl+K paleta
  server/
    auth-guard.ts     ← requireUser()
    queries/          ← čítanie (volané z RSC, bez "use server")
    actions/          ← mutácie ("use server")
  lib/                ← čisté funkcie, bez závislosti na DB
  db/                 ← schéma, klient, migrácie, seed
```

**Pravidlo:** `src/lib/**` nesmie importovať nič z `src/db/**` ani `src/server/**`. Sú to čisté funkcie, testovateľné vo vitest bez databázy.

## Farby a dizajn

Používaj **výhradne** sémantické tokeny z `globals.css`, nikdy priame Tailwind farby (`bg-slate-800` je chyba, `bg-surface` je správne).

| Token | Použitie |
|---|---|
| `bg-bg` | plátno stránky |
| `bg-surface`, `bg-surface-2` | karty, vyvýšené plochy |
| `border-border`, `border-border-strong` | okraje |
| `text-fg`, `text-fg-muted`, `text-fg-subtle` | text v troch úrovniach dôrazu |
| `bg-accent`, `text-accent`, `bg-accent-soft` | primárna akcia, aktívny stav |
| `text-p1`, `text-p2`, `text-p3` | priorita 1/2/3 |
| `text-frog`, `bg-frog-soft` | žaba dňa — **nikde inde** |
| `text-success`, `text-warn`, `text-danger` | sémantika stavu |
| `text-energy-low/mid/high` | energetická náročnosť |
| `bg-accent-badge`, `bg-frog-tint`, `bg-danger-tint` | priesvitné podklady odznakov |

Hodnoty pochádzajú z návrhu „Terminál" (Claude Design, 8/2026) a sú prepísané doslovne vrátane tmavej vetvy.

**Jantárová a červená sú obsadené významom.** `frog` znamená prioritu dňa, `danger` znamená „po termíne". Akcent sa im nesmie priblížiť — inak prestane byť rozoznateľné, čo je dôležité a čo je len tlačidlo. Pri výmene palety to platí ako prvé.

Tmavý režim funguje cez triedu `.dark` na `<html>`. Nikdy nepíš `dark:` s natvrdo zadanou farbou — tokeny sa prepínajú samy.

### Typografia

Písmo: **IBM Plex Sans** na rozhranie, **JetBrains Mono** na štítky, čísla, časy a termíny — všetko, čo sa má dať prebehnúť očami v stĺpci. Obe cez `next/font` so subsetom `latin-ext`; bez neho vypadnú slovenské diakritické znaky na náhradné písmo.

| Trieda | Veľkosť | Použitie |
|---|---|---|
| `text-micro` | 10 px | odznaky s počtom, klávesy |
| `text-mini` | 11 px | štítky sekcií, metadáta v riadku |
| `text-meta` | 12 px | doplnkový text pod poľom |
| `text-body` | 13 px | bežný text v hustých zoznamoch |

Nikdy nepíš `text-[13px]` — je to tá istá škála bez mena a nedá sa zmeniť naraz. Tailwindové `text-sm`/`text-lg` ostávajú v platnosti pre nadpisy a väčší text.

> **Pozor pri pridávaní ďalšej veľkosti:** meno treba dopísať aj do `extendTailwindMerge` v `src/lib/utils.ts`. Bez toho si `tailwind-merge` vyloží `text-nieco` ako FARBU a pri kolízii s naozajstnou farbou veľkosť ticho zahodí. Preklad ani testy to nechytia.

Čísla, ktoré sa menia (počty, časy, dátumy), patria do `font-mono tabular-nums`. V proporcionálnom písme je jednotka užšia než osmička, takže odznak pri každej zmene podskočí.

Štítok sekcie je utilita `.label` (mono, veľké písmená, preloženie 0.14em). **Farbu nenesie** — dopĺňa ju každé použitie, lebo sa mení podľa stavu.

### Tvar a elevácia

Zaoblenie: `rounded-xs` (2), `rounded-sm` (4), `rounded` (6), `rounded-lg` (10), `rounded-xl` (16). Návrh je ostrý — prevažujú 4–6 px.

Tiene: `shadow-sm` (jemné vyvýšenie), `shadow-lg` (plávajúce panely), `shadow-accent` (žiara pod primárnou akciou). Nepoužívaj tailwindové predvolené tiene — v tmavom režime nie sú ladené.

Ikony: `lucide-react`, veľkosť 13–15 px v riadkoch, 18 px v navigácii.

**Zdrojové premenné sa nesmú volať rovnako ako tailwindové tokeny.** `--radius-sm: var(--radius-sm)` v `@theme` je odkaz sám na seba a celú skupinu znefunkční — `rounded-lg` ticho vypadne na 0 px. Preto sú tiene v `:root` pod `--sh-*`.

### Dotykové ciele

Na telefóne má byť každý cieľ aspoň **44 px**. Nesie to primitív, nie volajúci: `Button`, `Input`, `SelectTrigger` aj `SelectItem` sú na telefóne 44 px a od `md:` sa sťahujú na hustotu pre myš. Nepíš `className="h-11 md:h-9"` — to je záplata, ktorá bola v projekte 148-krát.

Výnimka je `Button size="sm"`: je to hustá veľkosť do riadkov, kde dotykovú plochu nesie celý riadok. Nikdy ju nedávaj tlačidlu, ktoré je na mobile jediným cieľom.

Kde sa cieľ nezmestí (hviezdička priority dňa má 14 px), rozšír ho neviditeľným pseudoprvkom `before:absolute before:-inset-2` — riadok sa tým neroztiahne ani o pixel.

### Rozloženie

`--bar-height` a `--bar-inset` držia výšku spodnej lišty na telefóne. Nikdy ju nepíš ako `calc(3.5rem + env(safe-area-inset-bottom))` — bola to tá istá konštanta na štyroch nezávislých miestach a stačilo zmeniť tri.

Breakpointy: **`md`** delí telefón od počítača (bočný panel vs. spodná lišta, dotyk vs. myš), **`sm`** ladí hustotu obsahu, **`lg`** zapína druhý stĺpec tam, kde ho obrazovka má.

Vrstvy: `z-30` mobilná hlavička, `z-40` spodná lišta a plávajúce prvky, `z-50` dialógy a vyskakovacie panely.

## Prístupnosť

Appka je keyboard-first. Každý interaktívny prvok musí byť dosiahnuteľný tabom, mať viditeľný focus (rieši `:focus-visible` v `globals.css`) a `aria-label`, ak nemá textový obsah. Drag & drop musí mať klávesovú alternatívu.

---

# Kontrakty

## `src/lib/dates.ts`

```ts
/** Dnešný dátum ako YYYY-MM-DD v lokálnom čase (nie UTC!). */
export function today(now?: Date): string;
/** YYYY-MM-DD ± n dní. */
export function addDays(iso: string, n: number): string;
/** Pondelok týždňa, do ktorého dátum patrí. */
export function startOfWeek(iso: string, weekStartsOn?: number): string;
/** Pole 7 dátumov od pondelka. */
export function weekDays(iso: string, weekStartsOn?: number): string[];
/** Mriežka mesiaca vrátane dobiehajúcich dní zo susedných mesiacov. */
export function monthGrid(year: number, month: number, weekStartsOn?: number): string[];
export function isToday(iso: string, now?: Date): boolean;
export function isPast(iso: string, now?: Date): boolean;
/** „dnes", „zajtra", „pondelok", „12. aug" — pre zobrazenie. */
export function formatRelativeSk(iso: string, now?: Date): string;
/** „utorok 12. augusta" */
export function formatLongSk(iso: string): string;
/** 90 → „1 h 30 min" */
export function formatDuration(minutes: number): string;
export function parseIsoDate(iso: string): Date;
export function toIsoDate(d: Date): string;
```

Dátumy sú **vždy** `YYYY-MM-DD` reťazce v lokálnom čase. Nikdy `new Date(iso)` bez ošetrenia — to parsuje ako UTC a posúva deň.

## `src/lib/parse.ts` — slovenský parser

```ts
export type ParsedTokenKind =
  | "planned" | "due" | "time" | "priority"
  | "estimate" | "energy" | "context" | "tag" | "project";

export interface ParsedToken {
  kind: ParsedTokenKind;
  /** Presný úsek pôvodného textu, aby sa dal zvýrazniť v inpute. */
  start: number;
  end: number;
  raw: string;
  label: string;      // čitateľné zobrazenie, napr. „piatok 8. 8."
}

export interface ParsedCapture {
  title: string;              // text po odstránení všetkých rozpoznaných tokenov
  plannedDate?: string;
  plannedTime?: string;       // HH:MM
  dueDate?: string;
  dueTime?: string;
  priority?: 1 | 2 | 3;
  estimateMin?: number;
  energy?: "low" | "mid" | "high";
  context?: string;           // vrátane @
  tags: string[];             // bez #
  projectName?: string;       // bez +
  tokens: ParsedToken[];
}

export function parseCapture(
  input: string,
  opts?: { now?: Date; weekStartsOn?: number },
): ParsedCapture;
```

**Rozlíšenie termínu a plánu podľa predložky — jadro celého systému:**

| Vzor | Pole |
|---|---|
| `v piatok`, `na zajtra`, `zajtra`, `dnes`, `pozajtra`, `12.8.` | `plannedDate` |
| `do piatku`, `do 31.3.`, `termín 31.3.`, `deadline 31.3.` | `dueDate` |

Ďalšie tokeny: `15:00` · `o 15:00` → čas · `!1 !2 !3` → priorita · `@kontext` · `#tag` · `+projekt` · `15m`, `90min`, `2h`, `1,5h` → odhad · `!!nizka`/`!!stredna`/`!!vysoka` → energia.

Slovenské dni v týždni vo všetkých pádoch, ktoré sa reálne píšu: `pondelok/pondelka/pondelky`, `utorok/utorka`, `streda/stredu/stredy`, `štvrtok/stvrtok/štvrtka`, `piatok/piatka`, `sobota/sobotu/soboty`, `nedeľa/nedelu/nedele`. Diakritika **nesmie** byť povinná (`stvrtok` = `štvrtok`).

Relatívne: `o týždeň`, `o 2 týždne`, `o mesiac`, `o 3 dni`, `budúci týždeň`, `budúci pondelok`.

Dátumy: `12.8.`, `12.8.2026`, `12. 8.`, `12 aug`, `12. augusta`. Bez roku → najbližší budúci výskyt.

Parser **nikdy nevyhodí výnimku**. Nerozpoznaný text ostáva v `title`.

## `src/server/auth-guard.ts`

```ts
export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  settings: Settings;   // z @/lib/settings, vždy doplnené o defaulty
}
/** Presmeruje na /prihlasenie, ak nie je prihlásený. */
export function requireUser(): Promise<CurrentUser>;
/** Vráti null namiesto presmerovania. */
export function getCurrentUser(): Promise<CurrentUser | null>;
```

## `src/server/queries/tasks.ts`

```ts
export interface TaskWithRelations extends Task {
  area: { id: string; name: string; color: string } | null;
  project: { id: string; name: string } | null;
  subtaskCount: number;
  doneSubtaskCount: number;
}

export function getTasksForDay(userId: string, date: string): Promise<TaskWithRelations[]>;
export function getTasksForRange(userId: string, from: string, to: string): Promise<TaskWithRelations[]>;
export function getInboxTasks(userId: string): Promise<TaskWithRelations[]>;
export function getOverdueTasks(userId: string, asOf: string): Promise<TaskWithRelations[]>;
export function getSomedayTasks(userId: string): Promise<TaskWithRelations[]>;
export function getTask(userId: string, id: string): Promise<TaskWithRelations | null>;
export function getCounts(userId: string, today: string): Promise<{
  inbox: number; today: number; overdue: number;
}>;
export function getAreas(userId: string): Promise<Area[]>;
export function getProjects(userId: string): Promise<Project[]>;
```

Všetky dotazy **musia** filtrovať `deletedAt IS NULL` a `userId`.

## `src/server/actions/tasks.ts`

Súbor začína `"use server";`. Každá akcia:
1. zavolá `requireUser()`,
2. overí vstup cez zod,
3. zapíše zmenu **aj** riadok do `task_events`,
4. zavolá `revalidatePath` pre dotknuté cesty,
5. vráti `ActionResult`.

```ts
export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? {} : { data: T }))
  | { ok: false; error: string };

export function createTask(input: CreateTaskInput): Promise<ActionResult<{ id: string }>>;
export function quickCapture(raw: string, opts?: { forceInbox?: boolean }): Promise<ActionResult<{ id: string; title: string }>>;
export function updateTask(id: string, patch: UpdateTaskPatch): Promise<ActionResult>;
export function toggleTaskDone(id: string): Promise<ActionResult<{ done: boolean }>>;
export function deleteTask(id: string): Promise<ActionResult>;      // mäkké zmazanie
export function restoreTask(id: string): Promise<ActionResult>;
export function rescheduleTask(id: string, plannedDate: string | null): Promise<ActionResult<{ postponeCount: number }>>;
export function setFrog(id: string, on: boolean): Promise<ActionResult>;
export function reorderTasks(ids: string[]): Promise<ActionResult>;
```

**Počítadlo odkladov** (`rescheduleTask`): `postponeCount` sa zvýši **iba** ak úloha už mala `plannedDate`, nový dátum je **neskorší** a stav nie je `done`/`dropped`. Posun dozadu ani prvé naplánovanie sa nerátajú. Zapíše sa `task_events` typu `postponed`.

**Žaba** (`setFrog`): naraz môže byť žabou len jedna úloha na daný `plannedDate` — zapnutie zhasne ostatné v ten deň.

## `src/components/ui/*` — primitívy

```tsx
// button.tsx
type ButtonProps = React.ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
};
export function Button(props: ButtonProps): JSX.Element;

// input.tsx
export function Input(props: React.ComponentProps<"input">): JSX.Element;

// kbd.tsx  — <Kbd>Ctrl</Kbd><Kbd>K</Kbd>
export function Kbd({ children }: { children: React.ReactNode }): JSX.Element;
```

`dialog.tsx`, `popover.tsx`, `select.tsx`, `checkbox.tsx`, `tooltip.tsx` sú tenké obaly nad rovnomennými `@radix-ui/react-*`, exportujú `Dialog`, `DialogTrigger`, `DialogContent`, `DialogTitle` atď. v štýle shadcn/ui, ale ručne písané s našimi tokenmi.

## `src/components/task/task-item.tsx` — zdieľané zobrazenie úlohy

Používajú ho **Dnes, Inbox aj Týždeň**. Nikto si nerobí vlastnú kópiu.

```tsx
export interface TaskItemProps {
  task: TaskWithRelations;
  /** compact = riadok v týždennom stĺpci, full = obrazovka Dnes/Inbox */
  density?: "compact" | "full";
  showDate?: boolean;
  showFrog?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}
export function TaskItem(props: TaskItemProps): JSX.Element;
```

Ďalej v tom istom priečinku: `priority-dot.tsx`, `energy-badge.tsx`, `estimate-chip.tsx`, `postpone-badge.tsx` (zobrazí sa až od `postponeWarnAt`), `area-dot.tsx`, `task-checkbox.tsx` (optimistické odškrtnutie cez `useOptimistic`).

## Mutácie z klienta

Klientské komponenty volajú server actions priamo a stav prekresľujú optimisticky (`useOptimistic` alebo `useTransition`). Žiadne `fetch("/api/...")` — REST vrstva pribudne až s offline syncom (M2).

## Testy

Vitest, súbory `*.test.ts` vedľa zdroja. Testuje sa `src/lib/**` (čisté funkcie) — hlavne parser a dátumy. UI a DB sa v M1 netestujú.

---

# Kontrakty M3 — štruktúra

## `src/server/queries/structure.ts`

```ts
export interface ProjectWithCounts extends Project {
  area: { id: string; name: string; color: string } | null;
  openTaskCount: number;
  doneTaskCount: number;
  /** Najbližší termín spomedzi nevybavených úloh projektu. */
  nextDueDate: string | null;
}
export interface AreaWithCounts extends Area {
  openTaskCount: number;
  projectCount: number;
}

export function listProjects(userId: string, options?: { includeArchived?: boolean }): Promise<ProjectWithCounts[]>;
export function getProject(userId: string, id: string): Promise<ProjectWithCounts | null>;
export function listAreas(userId: string, options?: { includeArchived?: boolean }): Promise<AreaWithCounts[]>;
export function getArea(userId: string, id: string): Promise<AreaWithCounts | null>;
export function getSubtasks(userId: string, parentTaskId: string): Promise<Task[]>;
export function getTaskTags(userId: string, taskId: string): Promise<Tag[]>;
export function listTags(userId: string): Promise<(Tag & { taskCount: number })[]>;
```

**Pozor na kolíziu mien:** `getAreas` a `getProjects` v `queries/tasks.ts` ostávajú, kde sú — volá ich layout aj inbox. Nové funkcie majú zámerne predponu `list`.

## `src/server/actions/structure.ts`

```ts
createProject(input)   updateProject(id, patch)   archiveProject(id, archived)   deleteProject(id)
createArea(input)      updateArea(id, patch)      archiveArea(id, archived)      deleteArea(id)
attachTag(taskId, name)                           detachTag(taskId, tagId)
```

Všetky vracajú `ActionResult`, rovnako ako akcie úloh.

**Archivácia ≠ mazanie.** Archivovaný projekt sa neponúka vo výberoch, ale jeho úlohy a história ostávajú (`archivedAt`). Mäkké zmazanie (`deletedAt`) úlohy **odpojí** — nastaví im `projectId`/`areaId` na `null`. Databázové `onDelete: set null` sa pri mäkkom mazaní neuplatní, lebo riadok fyzicky ostáva; bez ručného odpojenia by úlohy visel na projekte, ktorý používateľ už nevidí.

## Rozšírenia v úlohách

```ts
// queries/tasks.ts
getSomedayTasks(userId)   // horizont „someday", vrátane tých, čo ešte visia v inboxe
getWaitingTasks(userId)   // stav `waiting`
getCounts(userId, today)  // { inbox, today, overdue, someday, waiting }

// actions/tasks.ts
addSubtask(parentTaskId, title)      reorderSubtasks(parentTaskId, ids)      setWaiting(id, waiting)
```

**Podúloha** dedí `projectId` a `areaId`, nededí dátumy ani prioritu — je to krok, nie samostatný záväzok. Stav dostane `todo`, nie `inbox`. Povolená je **len jedna úroveň** zanorenia.

**`setWaiting(id, false)`** vráti úlohu do stavu, v ktorom je viditeľná: s naplánovaným dňom `todo`, bez neho `inbox`. Bez toho by zmizla zo všetkých obrazoviek — inbox filtruje podľa stavu, ostatné podľa dátumu.

---

# Kontrakty M4 — nápady

Nápad nie je úloha: úloha je záväzok, nápad je možnosť. Vlastná tabuľka, vlastný životný cyklus `raw → incubating → promoted | rejected` a k tomu odvodené `faded`.

## `src/lib/ideas.ts` — čistá logika

```ts
export type IdeaStageValue = "raw" | "incubating" | "promoted" | "rejected" | "faded";

/** Koľko CELÝCH dní ubehlo od dotyku. Nikdy záporné, neplatný dátum → 0. */
export function daysSinceTouch(lastTouchedAt: Date, now?: Date): number;
/** Okamih presne `days` dní pred `now` — hranica „nedotknuté aspoň `days` dní" pre SQL. */
export function touchThreshold(days: number, now?: Date): Date;
/** Uložená fáza + vek → fáza, ktorú vidí používateľ. */
export function effectiveIdeaStage(stored: IdeaStageValue, staleDays: number, fadeAfterDays: number): IdeaStageValue;

/** Koľko dní čakania vyváži jeden stupeň iskry. */
export const SPARK_DAY_VALUE = 30;
/** skóre = dni bez dotyku + (iskra − 1) × 30 */
export function incubatorScore(staleDays: number, spark: number): number;
/** Vyššie skóre dopredu; pri zhode dlhšie čakanie, potom `id` (stabilné poradie). */
export function compareIncubatorCandidates(
  a: { staleDays: number; spark: number; id: string },
  b: { staleDays: number; spark: number; id: string },
): number;
```

Platí tu rovnaké pravidlo ako pre celý `src/lib/**`: **žiadny import z `src/db` ani `src/server`**. Testy sú v `src/lib/ideas.test.ts`.

**`faded` sa do databázy NIKDY nezapisuje.** Odvodzuje sa pri čítaní z `lastTouchedAt` a nastavenia `fadeAfterDays`. Appka nemá cron a zaviesť ho kvôli jednému príznaku je neúmerné — a hlavne: vyblednutý nápad tak **obživne v tej sekunde, ako sa ho niekto dotkne**, bez osobitnej akcie. Uzavreté fázy (`promoted`, `rejected`) vyblednúť nemôžu.

**Prahy sa berú z nastavení používateľa** (`incubatorAfterDays`, predvolene 30; `fadeAfterDays`, predvolene 180), nie z konštánt v kóde. Čítajú sa pre `userId` z parametra, nie zo session — inak by sa cudzie nápady dopočítavali podľa vlastných prahov.

## `src/server/queries/ideas.ts`

```ts
export interface IdeaWithRelations extends Idea {
  area: { id: string; name: string; color: string } | null;
  /** Projekt, na ktorý bol nápad povýšený. */
  promotedProject: { id: string; name: string } | null;
  /** Koľko dní sa nápadu nikto nedotkol. */
  staleDays: number;
  /** Odvodená fáza — vrátane `faded`, ktorá v databáze nie je. */
  effectiveStage: IdeaStageValue;
}

export interface ListIdeasOptions {
  /** Pribrať aj `promoted` a `rejected`. Predvolene nie. */
  includeSettled?: boolean;
}

export function listIdeas(userId: string, options?: ListIdeasOptions): Promise<IdeaWithRelations[]>;
export function getIdea(userId: string, id: string): Promise<IdeaWithRelations | null>;
/** Najdlhšie nedotknuté vážené iskrou; predvolene 3. */
export function getIncubatorIdeas(userId: string, limit?: number): Promise<IdeaWithRelations[]>;
export function getIdeaCounts(userId: string): Promise<{ raw: number; incubating: number; faded: number }>;
```

Ako všade: každý dotaz filtruje `userId` **aj** `deletedAt IS NULL` — vrátane pripojených oblastí a projektov v JOIN-och.

**Vyblednuté nápady v zozname ostávajú** (`faded` je odvodený stav nad uloženým `raw`/`incubating`, nápad je stále v hre). Do **inkubátora** sa ale nedostanú: ten má pripomínať to, čo ešte žije. Kandidát musí byť otvorený, nedotknutý aspoň `incubatorAfterDays` dní a zároveň ešte nevyblednutý.

## `src/server/actions/ideas.ts`

```ts
createIdea(input)              // → { id }
updateIdea(id, patch)          // text, oblasť, iskra, ďalší krok, fáza
setIdeaStage(id, stage)        // "raw" | "incubating" | "rejected"
touchIdea(id)                  // len osvieži lastTouchedAt
promoteIdeaToProject(id)       // → { projectId }
deleteIdea(id)                 // mäkké zmazanie
restoreIdea(id)
```

Všetky vracajú `ActionResult`, rovnako ako akcie úloh a štruktúry.

**Každý zásah je dotyk.** `createIdea`, `updateIdea` aj `setIdeaStage` obnovujú `lastTouchedAt` — práve preto vyblednutý nápad obživne bez osobitnej akcie. Výnimka je `restoreIdea`: obnovenie omylom zmazaného nápadu nie je rozhodnutie o jeho budúcnosti a nemá mu resetovať hodiny zrenia.

**`promoted` sa nedá nastaviť ručne** — jedine cez `promoteIdeaToProject`, inak by nápad tvrdil, že z neho vznikol projekt, ktorý neexistuje. `faded` sa nedá nastaviť vôbec. Povýšenému nápadu sa fáza už meniť nedá (text áno).

**Povýšenie je jedna transakcia.** V nej vznikne projekt (názov z `title`, cieľ z `body`, oblasť z nápadu — len ak ešte žije), z `nextStep` **prvá úloha** projektu so stavom `todo` a horizontom `week` plus riadok v `task_events`, a nakoniec sa nápad prepne na `promoted` s odkazom na projekt. Polovičné povýšenie je horšie než žiadne: projekt bez väzby na nápad je sirota a nápad s `promotedProjectId` do prázdna je klamstvo. Prvým krokom transakcie je `select … for update` nad riadkom nápadu — obyčajné čítanie by na READ COMMITTED dva súbežné pokusy nezastavilo a ostal by po nich sirotský projekt.

Nápad sa pri povýšení **nemaže** — chceme vidieť, z čoho projekt vznikol. Druhé povýšenie sa odmieta. Ak sa názov projektu bije s existujúcim (M3 nedovolí dva rovnaké), povýšenie zlyhá zrozumiteľnou hláškou a nezaloží nič.

## Doplnok k M3

`deleteArea` odpája aj **nápady** (`ideas.areaId → null`), rovnako ako úlohy a projekty. Bez toho by nápad držal väzbu na mäkko zmazanú oblasť — `deletedAt` je len príznak, databázové `on delete set null` sa neuplatní. `lastTouchedAt` sa pritom nemení: zmazanie oblasti nie je dotyk nápadu.

---

# Kontrakty M5 — anti-prokrastinácia

Väčšina M5 stojí už z M1: `postponeCount`, odznak odkladov, rozpočet času na „Dnes" aj „Týždeň". Dopĺňajú sa tri veci — nastavenia, blok pri odkladoch, „Čo teraz?".

## Migrácia: `task_events.note`

M5 potrebuje **jednu** migráciu — nový nullable stĺpec `note text` v `task_events`.

Dôvod odkladu je voľný text a `fromValue`/`toValue` držia dátumy. Napchať doň vetu by znamenalo, že M6 (revízie) a M7 (štatistiky) musia hádať, čo v stĺpci je. Nullable stĺpec je najlacnejšia možná migrácia a je to presne to, na čo je.

## `src/lib/settings.ts` — vstupná schéma zvlášť

Do `settingsSchema` sa **nesmú** pridávať `.refine()`. Je to schéma *úložiska* a používa ju `parseSettings`, ktorá pri chybe padá na `DEFAULT_SETTINGS` — jedna porušená dvojica by tak používateľovi zhodila **všetky** ostatné nastavenia na predvolené. To je horšie než nekonzistentná hodnota.

Krížové kontroly preto patria do samostatnej vstupnej schémy, ktorú používa iba akcia:

```ts
/** Iba pre `updateSettings`. Nikdy sa ňou nečíta uložený stav. */
export const settingsInputSchema = settingsSchema
  .refine((s) => s.dayEndHour > s.dayStartHour, {
    message: "Koniec dňa musí byť neskôr než začiatok.",
    path: ["dayEndHour"],
  })
  .refine((s) => s.postponeBlockAt > s.postponeWarnAt, {
    message: "Prah blokovania musí byť vyšší než prah upozornenia.",
    path: ["postponeBlockAt"],
  })
  .refine((s) => s.fadeAfterDays > s.incubatorAfterDays, {
    message: "Nápad musí do inkubátora vyplávať skôr, než vybledne.",
    path: ["fadeAfterDays"],
  });

/** Existuje toto pásmo? Neplatné by rozbilo `todayIn` na každej obrazovke. */
export function isValidTimeZone(tz: string): boolean;
```

Že sa dnes `dayEndHour ≤ dayStartHour` nastaviť dá, nie je hypotéza — `TimeBudget` na to má vetvu. Tá tam ostáva ako poistka pre staré uložené hodnoty.

## `src/server/actions/settings.ts`

```ts
updateSettings(patch: Partial<Settings>): Promise<ActionResult<Settings>>
```

Zlúči `patch` nad **aktuálne** nastavenia, overí `settingsInputSchema` a zapíše celý objekt. Nikdy nezapisuje samotný `patch` — chýbajúce kľúče by sa tichom prepísali na defaulty.

Po zmene `timezone`, `weekStartsOn`, `wipLimit` ani prahov sa nič neprepočítava: všetky sa čítajú pri každom vykreslení. Stačí `revalidatePath` nad tými istými cestami ako pri úlohách.

## Blok pri odkladoch — rozšírenie `rescheduleTask`

```ts
rescheduleTask(id, plannedDate, opts?: { reason?: string }): Promise<ActionResult<{ postponeCount: number }>>
```

Blok sa spustí na tom pokuse, ktorý by `postponeCount` **dovŕšil** na `postponeBlockAt` — pri predvolenej päťke je to piate odloženie. Počítadlo teda nikdy nepreskočí prah bez rozhodnutia.

Bez dôvodu vráti akcia odmietnutie s vlastným kódom, aby ho klient vedel odlíšiť od bežnej chyby a otvoril dialóg:

```ts
{ ok: false, code: "postpone_blocked", error: "…", data: { postponeCount, postponeBlockAt } }
```

S neprázdnym dôvodom prejde a dôvod ide do `task_events.note` na tom istom riadku typu `postponed`.

**Kontrola je na serveri, nie v dialógu.** Klient sa dá obísť — zastaraná záložka, outbox, druhé zariadenie. Dialóg je len pohodlie.

Blok platí iba na skutočné odklady: posun dopredu, zrušenie dátumu ani prvé naplánovanie odkladom nie sú, tak ako doteraz.

Dialóg ponúka štyri východiská. Tri z nich **nie sú nové akcie** — sú to už existujúce operácie, len ponúknuté v správnej chvíli:

| Voľba | Čo zavolá |
|---|---|
| Rozdeľ na podúlohy | `addSubtask` (M3) |
| Zmenši rozsah | `updateTask` — názov a odhad |
| Zahoď | `deleteTask` |
| Odlož s dôvodom | `rescheduleTask` s `reason` |

Zavretie dialógu bez výberu znamená, že sa úloha **neodloží**. To je celý zmysel bloku.

## `src/lib/next-task.ts` — „Čo teraz?"

```ts
export interface NextTaskCandidate {
  id: string;
  energy: Energy | null;
  estimateMin: number | null;
  priority: number;
  isFrog: boolean;
  dueDate: string | null;
  postponeCount: number;
  /** Na rozhodovanie o veku — nie `Date`, aby funkcia ostala čistá. */
  createdAtIso: string;
}

export interface NextTaskQuery {
  /** Koľko mám sily. Strop, nie presná zhoda. */
  energy: Energy;
  /** Koľko mám času, v minútach. */
  availableMin: number;
  todayIso: string;
}

export interface NextTaskPick {
  taskId: string;
  /** Jeden dôvod pre používateľa — prečo práve táto. */
  reason: "frog" | "overdue" | "due" | "priority" | "postponed" | "oldest";
  /** Nezmestí sa do zadanej sily alebo času. Ponúka sa až keď nič lepšie nie je. */
  stretch: boolean;
}

export function rankNextTasks(
  candidates: NextTaskCandidate[],
  query: NextTaskQuery,
): NextTaskPick[];
```

Platí pravidlo pre celý `src/lib/**`: **žiadny import z `src/db` ani `src/server`**, žiadne `new Date()`. Testy v `src/lib/next-task.test.ts`.

**Energia je strop, nie zhoda.** Pri `high` sile sadne aj `low` úloha — opačne nie. Úloha bez energie sadne vždy: nevyplnené pole nie je dôvod ju skryť.

**Čas je strop rovnako.** `estimateMin ≤ availableMin`; bez odhadu sadne vždy.

**Nesediace sa nevyhadzujú, len klesnú.** Vracia sa celé poradie s `stretch: true` na konci. Prázdna ponuka je horšia než úprimné „toto sa ti do 15 minút nezmestí, ale nič kratšie nemáš" — a tlačidlo „daj inú" potrebuje kam kráčať.

Poradie sediacich: priorita dňa → po termíne → termín dnes → priorita 1 → najviac odkladov → najstaršie. Pri zhode rozhoduje `id`, aby bolo poradie stabilné.

Budúci termín naliehavý **nie je** — radí sa medzi bežné úlohy. Termín, ktorý ešte nenastal, nie je dôvod robiť niečo práve teraz.

Najviac odkladov ide **pred** vek zámerne: presne tá úloha, ktorej sa človek vyhýba, má vyplávať. To je celý zmysel míľnika.

## Obrazovka nastavení

Cesta `/nastavenia`. Odkaz patrí do **päty bočného panela** k prepínaču témy a odhláseniu — nie do `NAV_ITEMS`. Nastavenia nie sú miesto, kam sa chodí pracovať, a v mobilnom hárku „Viac" by tlačili von veci, ktoré sa používajú denne.

Ukladá sa po poli, bez tlačidla „Uložiť" — rovnako ako detail projektu z M3.

---

# Kontrakty M6 — rituály

Tabuľky `journal` aj `reviews` sú z M0 hotové vrátane `reviewType`. **Žiadna migrácia.**

## `src/lib/rituals.ts` — čistá logika

```ts
export type RitualType = "daily_plan" | "daily_shutdown" | "weekly" | "monthly";

/** Obdobie, ktoré rituál pokrýva. Pre denné je začiatok = koniec = dnešok. */
export interface RitualPeriod {
  start: string;  // YYYY-MM-DD
  end: string;
}

/** Obdobie pre daný typ a deň. Týždeň rešpektuje `settings.weekStartsOn`. */
export function ritualPeriod(
  type: RitualType,
  todayIso: string,
  weekStartsOn?: number,
): RitualPeriod;

/** Ktorá hodina rituál spúšťa. `null` = tento sa sám neotvára. */
export function ritualTriggerHour(
  type: RitualType,
  settings: { dayStartHour: number; dayEndHour: number },
): number | null;

/** Má sa rituál práve teraz otvoriť sám? Podmienky platia VŠETKY naraz. */
export function shouldAutoOpen(input: {
  type: RitualType;
  /** Hodina v pásme používateľa, 0–23. */
  hour: number;
  /** Z `ritualTriggerHour`. `null` zastaví otváranie. */
  triggerHour: number | null;
  /** Je rituál za toto obdobie hotový? */
  completed: boolean;
  /** Odložil ho človek tlačidlom „Nechať tak"? */
  snoozed: boolean;
  enabled: boolean;
  /** Je otvorený iný dialóg alebo rozpísané zachytenie? */
  busy: boolean;
}): boolean;

/** Kľúč odloženia v `sessionStorage`. Viaže sa na obdobie, nie na deň behu. */
export function snoozeKey(type: RitualType, period: RitualPeriod): string;
```

Platí pravidlo pre celý `src/lib/**`: **žiadny import z `src/db` ani `src/server`**, žiadne `new Date()`. Hodina prichádza zvonku, rovnako ako dnešok. Testy v `src/lib/rituals.test.ts`.

## Automatické otváranie — poistky

Otváranie bez vyžiadania je najrýchlejší spôsob, ako človeka odnaučiť appku otvárať. Preto platia **všetky** naraz:

| Podmienka | Prečo |
|---|---|
| Iba na `/dnes` | inde rituál nedáva zmysel a prerušil by prácu |
| Iba po `triggerHour` | ranný sa viaže na `dayStartHour`, večerný na `dayEndHour` |
| **Týždenná a mesačná sa neotvárajú vôbec** | 15–30 minút práce nemá nikoho prepadnúť — na tie sa treba rozhodnúť vedome. `ritualTriggerHour` im vracia `null` |
| Iba keď rituál za obdobie **nie je** hotový | riadok v `reviews` s `completedAt` |
| Nikdy cez otvorený dialóg ani rozpísané zachytenie | rozrobený text sa nesmie stratiť |
| Najviac raz za obdobie | „Nechať tak" odloží do zajtra, nie o päť minút |
| Dá sa vypnúť | `settings.ritualAutoOpen`, predvolene zapnuté |

Odloženie („Nechať tak") sa **neukladá do databázy** — stačí `sessionStorage`. Je to rozhodnutie o jednom dni, nie údaj, ktorý má prežiť. Ukladať ho do `reviews` by znamenalo riadok bez `completedAt`, ktorý sa nedá odlíšiť od rozrobeného rituálu.

## `src/server/queries/rituals.ts`

```ts
export interface RitualState {
  type: RitualType;
  period: RitualPeriod;
  /** Rozrobený alebo hotový záznam, ak existuje. */
  review: Review | null;
  completed: boolean;
}

export function getRitualState(userId: string, type: RitualType, period: RitualPeriod): Promise<RitualState>;
export function getJournalEntry(userId: string, date: string): Promise<Journal | null>;
export function getJournalRange(userId: string, from: string, to: string): Promise<Journal[]>;
```

Unikátny index `reviews_user_type_period_idx` robí z otázky „bol dnes večerný shutdown?" jeden lacný dopyt — a zároveň znemožňuje spraviť ten istý rituál dvakrát.

## `src/server/actions/rituals.ts`

```ts
saveRitualStep(type, period, payload)   // priebežné ukladanie, upsert
completeRitual(type, period, payload)   // nastaví completedAt
saveJournalEntry(date, { body, mood })  // upsert cez (userId, date)
```

Všetky vracajú `ActionResult` zo `@/server/action-result`.

**Rituál sa ukladá priebežne, nie až na konci.** Sprievodca má štyri až šesť krokov a zavrieť ho v polovici je bežné — Escape nesmie znamenať stratu. Preto `saveRitualStep` po každom kroku a `completeRitual` až na záver.

**Denník je súčasť večerného rituálu, nie samostatná obrazovka.** `journal` má unikátny index na (používateľ, dátum), takže druhý zápis prepisuje ten istý riadok.

## Rozšírenie nastavení

Pribúda **jediné** pole. Časy sa neberú z nových nastavení: ranný sprievodca sa viaže na `dayStartHour`, večerný na `dayEndHour` — obe existujú a znamenajú presne to, čo treba.

```ts
/** Má sa rituál otvoriť sám, keď príde jeho čas? */
ritualAutoOpen: z.boolean().default(true),
```

Do `settingsInputSchema` nepribúda žiadna krížová kontrola.

---

# Kontrakty M7 — návyky a čísla

`habits`, `habit_entries` aj `recurrence_rule`/`recurrence_parent_id` sú z M0 hotové. **Žiadna migrácia.**

## Návyk ≠ opakovaná úloha

Dve rôzne veci, ktoré sa nesmú zlúčiť:

| | Návyk | Opakovaná úloha |
|---|---|---|
| Kde žije | `/navyky` | v „Dnes" ako každá iná úloha |
| Zapĺňa deň | **nie** | áno |
| Cieľ | `targetPerWeek` | konkrétny deň z pravidla |
| Nesplnenie | séria drží, ak sedí týždenný cieľ | prepadne ako každá úloha |

Návyk sa **nikdy** nesmie dostať do `getTasksForDay`, `getActionableTasks` ani do rozpočtu času. Deň zaplnený položkami „napiť sa vody" by zrušil WIP limit z M5.

## `src/lib/recurrence.ts` — čistá logika

```ts
export type Frequency = "daily" | "weekly" | "monthly";

export interface Recurrence {
  freq: Frequency;
  /** Pri `weekly`: dni v týždni, 0 = nedeľa … 6 = sobota. Nikdy prázdne. */
  byDay?: number[];
  /** Pri `monthly`: deň v mesiaci 1–31. */
  byMonthDay?: number;
}

/** `FREQ=WEEKLY;BYDAY=MO,WE,FR` → objekt. Nerozpoznané → `null`, nikdy výnimka. */
export function parseRecurrence(rule: string | null): Recurrence | null;
/** Späť do RRULE zápisu — to, čo ide do `tasks.recurrence_rule`. */
export function formatRecurrence(recurrence: Recurrence): string;
/** Prvý výskyt PO `afterIso`. `null`, keď pravidlo nedáva zmysel. */
export function nextOccurrence(recurrence: Recurrence, afterIso: string): string | null;
/** Všetky výskyty v intervale (vrátane oboch krajných dní), zoradené. */
export function occurrencesBetween(recurrence: Recurrence, fromIso: string, toIso: string): string[];
/** Čitateľne po slovensky: „každý pondelok, stredu a piatok". */
export function describeRecurrence(recurrence: Recurrence): string;
```

**Ukladá sa podmnožina RRULE, nie vlastný formát.** Zápis je platný RRULE, číta sa z neho len podporované. Keby raz „každý druhý utorok" chýbal, parser sa rozšíri **bez migrácie**.

Podporované tvary — nič iné parser nerozpozná:

```
FREQ=DAILY
FREQ=WEEKLY;BYDAY=MO,WE,FR
FREQ=MONTHLY;BYMONTHDAY=15
```

**`BYMONTHDAY=31` v kratšom mesiaci padá na jeho posledný deň.** Preskočiť február by znamenalo, že mesačná faktúra raz za čas nepríde — a to je práve ten prípad, kvôli ktorému opakovanie existuje.

Platí pravidlo pre celý `src/lib/**`: žiadny import z `src/db` ani `src/server`, žiadne `new Date()`. Testy v `src/lib/recurrence.test.ts`.

## `src/lib/habits.ts` — čistá logika

```ts
export interface HabitWeek {
  /** Pondelok (alebo `weekStartsOn`) týždňa. */
  weekStart: string;
  /** Koľkokrát sa v tom týždni návyk splnil. */
  done: number;
  /** Sedel týždenný cieľ? */
  met: boolean;
}

/** Rozdelí splnené dni na týždne a vyhodnotí cieľ. */
export function habitWeeks(dates: string[], targetPerWeek: number, fromIso: string, toIso: string, weekStartsOn?: number): HabitWeek[];
/** Séria = počet po sebe idúcich týždňov s naplneným cieľom, od konca. */
export function currentStreak(weeks: HabitWeek[]): number;
export function longestStreak(weeks: HabitWeek[]): number;
/** Podiel splnenia za obdobie, 0–1. */
export function completionRate(weeks: HabitWeek[], targetPerWeek: number): number;
```

**Séria sa počíta na TÝŽDNE, nie na dni.** Cieľ je „X× do týždňa", takže denná séria by pri cieli 3× týždenne nedávala zmysel a jedno vynechanie by zhodilo mesiac poctivej práce. Prebiehajúci týždeň sériu **nezhadzuje**, kým sa nedá stihnúť — nedokončený týždeň nie je zlyhanie.

## `src/server/queries/habits.ts`

```ts
export interface HabitWithStats extends Habit {
  /** Dni splnenia v načítanom okne, vzostupne. */
  entries: string[];
  currentStreak: number;
  longestStreak: number;
  /** Splnené v tomto týždni / cieľ. */
  weekDone: number;
}

export function listHabits(userId: string, fromIso: string, toIso: string, weekStartsOn?: number): Promise<HabitWithStats[]>;
export function getHabitGrid(userId: string, habitId: string, fromIso: string, toIso: string): Promise<string[]>;
```

`habit_entries` nemá `userId` — je viazané cez `habitId`, takže **každý dotaz musí ísť cez JOIN na `habits` a filtrovať používateľa tam**. Priamy dotaz na `habit_entries` by vydal cudzie dáta.

## `src/server/actions/habits.ts`

```ts
createHabit(input)                 // → { id }
updateHabit(id, patch)             // názov, cieľ, farba, oblasť
toggleHabitEntry(id, date)         // odškrtne alebo odškrtnutie zruší
archiveHabit(id, archived)
deleteHabit(id)                    // tvrdé — návyk nemá `deletedAt`
```

`habits` **nemá** `deletedAt`, len `archivedAt`. Mazanie je preto tvrdé a zmaže aj záznamy (`on delete cascade`). V rozhraní sa preto ponúka archivácia ako predvolená voľba a mazanie ako výslovné rozhodnutie.

## Opakované úlohy — rozšírenie `actions/tasks.ts`

```ts
setRecurrence(id, rule: string | null)   // validuje cez parseRecurrence
materializeDueRecurrences(todayIso)      // → { created: number }
```

**Ďalší výskyt vzniká pri dokončení.** `toggleTaskDone` na úlohe s pravidlom založí ďalší výskyt s `recurrenceParentId` na pôvodnú úlohu. Appka nemá cron a zavádzať ho kvôli opakovaniu je neúmerné — rovnaká úvaha ako pri zhnití nápadov v M4.

Slabina je zrejmá: čo sa nikdy nedokončí, sa nikdy nezopakuje. Preto `materializeDueRecurrences` dobehne zameškané výskyty až po dnešok a volá ju **ranný sprievodca z M6** — beží denne a je to presne ten moment, keď majú dnešné opakované veci pribudnúť.

Dobiehanie **nesmie** založiť desiatky úloh naraz: ak od posledného výskytu ubehlo veľa času, vznikne **jeden** výskyt na najbližší platný deň. Sto prepadnutých faktúr v inboxe nikomu nepomôže.

## Win report

Zoznam všetkého dokončeného za týždeň patrí do **týždennej revízie** (M6), nie na vlastnú obrazovku. Zatvára sa ním týždeň a človek tam už aj tak je.

```ts
export function getCompletedInPeriod(userId: string, from: string, to: string): Promise<TaskWithRelations[]>;
```

---

# Kontrakty M8 — kalendár

Scope `calendar.readonly`, `access_type: offline` aj tabuľka `accounts` sú z M0. **Žiadna migrácia.**

## Tokeny

**Refresh token nesmie ísť do JWT.** Je to dlhodobé poverenie k cudziemu účtu a cookie je to posledné miesto, kam patrí. Ukladá sa do `accounts`, ktorá naň čaká od M0.

```ts
// src/server/google-tokens.ts   (bez "use server" — volá sa zo servera priamo)
export interface GoogleTokens {
  accessToken: string;
  expiresAt: Date;
}

/** Uloží tokeny po prihlásení. Volá sa z callbacku `jwt` v `auth.ts`. */
export function storeGoogleAccount(userId: string, account: {
  providerAccountId: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
}): Promise<void>;

/**
 * Platný prístupový token, v prípade potreby obnovený.
 * `null` = používateľ kalendár nepripojil alebo súhlas odvolal.
 */
export function getValidAccessToken(userId: string): Promise<string | null>;
```

**Refresh token príde len pri PRVOM súhlase.** Google ho pri ďalších prihláseniach neposiela, takže `storeGoogleAccount` ho **nesmie prepísať na `null`** — inak by druhé prihlásenie kalendár odpojilo. Prepisuje sa iba, keď naozaj prišiel nový.

**Obnova je lenivá.** Token platí hodinu; obnovuje sa až keď je potrebný a už vypršal (s minútovou rezervou na cestu po sieti). Žiadny cron — rovnako ako všetko ostatné v appke.

Keď obnova zlyhá s `invalid_grant`, súhlas bol odvolaný: `refresh_token` sa vymaže a appka sa tvári, že kalendár nie je pripojený. Opakovať zlyhávajúcu obnovu pri každom načítaní stránky by len spomaľovalo.

## `src/server/queries/calendar.ts`

```ts
export interface CalendarEvent {
  id: string;
  title: string;
  /** `HH:MM` v pásme používateľa; `null` pri celodennej udalosti. */
  start: string | null;
  end: string | null;
  /** Celodenná — zobrazí sa, ale do rozpočtu sa NERÁTA. */
  allDay: boolean;
  /** Dĺžka v minútach; 0 pri celodennej. */
  minutes: number;
}

/** Udalosti dňa z hlavného kalendára. Prázdne pole aj pri chybe. */
export function getDayEvents(userId: string, dateIso: string, timeZone: string): Promise<CalendarEvent[]>;
```

**Nikdy nevyhodí výnimku.** Nepovolené API, vypršaný súhlas aj výpadok siete vracajú prázdne pole. Kalendár je doplnok — appka, ktorá bez tretej strany nenabehne, je horšia než appka bez kalendára.

Vylúčené sú udalosti, ktoré používateľ **odmietol** (`responseStatus: "declined"`), a zrušené (`status: "cancelled"`). Pozvánka, ktorú si odmietol, nie je tvoj čas.

## Rozpočet času

**Meetingy UBERAJÚ z dostupného času, nepripočítavajú sa k naplánovanému.**

```
availableMin = (dayEndHour − dayStartHour) × 60 − súčet minút meetingov
```

Dvojhodinová porada neznamená dve hodiny práce navyše, ale dve hodiny, ktoré na prácu nezostali. `TimeBudget` z M5 dostane `meetingMin` a v pruhu ho ukáže zvlášť.

Celodenné udalosti majú `minutes: 0` a rozpočet nemenia — „dovolenka" hodiny neujedá a odpočítať ju by z rozpočtu spravilo nezmysel.

---

# Kontrakty M9 — dolaďovanie

`templates` aj `links` sú z M0 hotové. **Žiadna migrácia.**

## Skladanie diakritiky — `src/lib/fold.ts`

```ts
/** „Štvrtok" → „stvrtok". Malé písmená bez diakritiky. */
export function fold(text: string): string;
/** Tie isté dvojice ako SQL `translate()` — jeden zdroj pravdy. */
export const FOLD_FROM: string;
export const FOLD_TO: string;
```

**`unaccent` sa nepoužíva.** Je to rozšírenie, ktoré Neon má a PGlite nemusí — a jedna schéma musí bežať na oboch. Znaky si preložíme sami cez `translate()`; je to fixná tabuľka slovenských písmen, ktorá sa nikdy nezmení.

Klient aj SQL musia skladať **rovnako**, inak nájde paleta niečo iné než server. Preto sú dvojice v `src/lib/fold.ts` a SQL si ich odtiaľ berie ako parameter, nie ako druhý zoznam v inom súbore.

## `src/server/queries/search.ts`

```ts
export type SearchKind = "task" | "idea" | "project" | "area" | "journal";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  /** Kúsok textu, v ktorom sa zhoda našla. `null`, keď je zhoda v názve. */
  snippet: string | null;
  /** Kam odkaz vedie. */
  href: string;
  /** Uzavreté, zahodené alebo mäkko zmazané — v zozname sa stlmí. */
  archived: boolean;
}

export function search(userId: string, query: string, limit?: number): Promise<SearchHit[]>;
```

Hľadá sa `ILIKE` nad zloženým textom, nie `to_tsvector`: slovenský slovník Postgres nemá, takže by stemming aj tak nefungoval, a pri osobnej appke ide o tisíce riadkov, nie milióny.

**Prázdny alebo jednoznakový dopyt vráti prázdno**, nie celú databázu.

## `src/server/queries/archive.ts`

```ts
export interface ArchiveOptions {
  /** `done` · `dropped` · `deleted`. Predvolene všetky. */
  kinds?: ("done" | "dropped" | "deleted")[];
  limit?: number;
}
export function getArchivedTasks(userId: string, options?: ArchiveOptions): Promise<TaskWithRelations[]>;
export function getArchivedIdeas(userId: string): Promise<IdeaWithRelations[]>;
```

Archív **nemaže natvrdo**. Jediné miesto, kde sa v celej appke maže naozaj, ostáva návyk — a aj ten sa pýta dvakrát. Vracia sa cez existujúce `restoreTask` / `restoreIdea`.

## Export — `src/app/api/export/route.ts`

Jeden JSON so všetkým, cez `GET` s `Content-Disposition: attachment`.

**Nie CSV.** Úlohy majú podúlohy, štítky, históriu a vzťahy, ktoré tabuľka nezachytí. Cieľ nie je otvoriť to v Exceli, ale mať dáta von, keby appka zajtra zhorela.

Export obsahuje **aj mäkko zmazané** riadky — je to záloha, nie prehľad. Neobsahuje tokeny z `accounts`: poverenie ku Googlu do zálohy nepatrí.

## Šablóny — `src/server/actions/templates.ts`

```ts
/** Definícia jednej úlohy v šablóne. Podmnožina `CreateTaskInput`. */
export interface TemplateTask {
  title: string;
  note?: string;
  priority?: number;
  estimateMin?: number;
  energy?: "low" | "mid" | "high";
  context?: string;
  /** Posun oproti dňu použitia: 0 = v ten deň, 1 = nasledujúci. */
  dayOffset?: number;
}

createTemplate(input)                      // → { id }
updateTemplate(id, patch)
deleteTemplate(id)
applyTemplate(id, startDateIso)            // → { created: number }
```

**Šablóna je pole definícií, nie kópia existujúcich úloh.** „Ranná rutina" sa nemá rozbiť tým, že sa jedna z pôvodných úloh zmaže.

`dayOffset` je relatívny — šablóna „Príprava na dovolenku" sa dá použiť kedykoľvek a dni sa dopočítajú od zvoleného začiatku.

## Odkazy — `src/lib/wikilink.ts` a `src/server/actions/links.ts`

```ts
export interface WikiLink { raw: string; label: string; start: number; end: number }
/** Nájde `[[…]]` v texte. Nikdy nevyhodí výnimku. */
export function parseWikiLinks(text: string): WikiLink[];
```

```ts
syncLinks(fromType, fromId, text)   // prepočíta `links` podľa textu
```

**Odkaz na nič neexistujúce sa NEZAHODÍ.** Ostáva v texte ako obyčajný `[[text]]` a keď entita s tým názvom vznikne, odkaz ožije. Vynucovať existenciu vopred by z písania spravilo administratívu.

`links` je len index pre spätné odkazy — **pravda je text**. Preto `syncLinks` riadky prepočítava, nie dopĺňa: zmazaný `[[odkaz]]` musí zmiznúť aj z tabuľky.
