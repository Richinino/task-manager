# Konvencie projektu

Záväzné rozhrania, na ktorých stoja všetky moduly. Kto mení tento súbor, mení kontrakt — rob to vedome.

## Prostredie

Next.js 16.3 (App Router, Turbopack) · React 19.2 · TypeScript 6 (`strict`, `noUncheckedIndexedAccess`) · Tailwind CSS 4.3 · Drizzle 0.45 · Zod 4 · Auth.js v5 beta.

- Alias `@/*` → `./src/*`
- Jazyk UI a komentárov: **slovenčina**. Kód, názvy premenných a súborov: **angličtina**.
- Súbory: `kebab-case.tsx`. Komponenty: `PascalCase`. Funkcie: `camelCase`.
- `noUncheckedIndexedAccess` je zapnuté — indexovanie poľa vracia `T | undefined`. Používaj `arr[i]!` len tam, kde je to preukázateľne bezpečné.

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

Zaoblenie `rounded` (0.5rem). Ikony: `lucide-react`, veľkosť 16 px v riadkoch, 18 px v navigácii.

Tmavý režim funguje cez triedu `.dark` na `<html>`. Nikdy nepíš `dark:` s natvrdo zadanou farbou — tokeny sa prepínajú samy.

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
