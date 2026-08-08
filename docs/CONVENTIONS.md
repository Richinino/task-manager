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
