/**
 * Naplní databázu základnými oblasťami a niekoľkými ukážkovými úlohami,
 * aby appka po prvom spustení nebola prázdna.
 *
 * Spustenie:  npm run db:seed
 * Je idempotentný — opakované spustenie nič nezduplikuje.
 */
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "./client";
import { areas, tasks, users } from "./schema";
import { addDays, todayIn } from "../lib/dates";
import { uuidv7 } from "../lib/id";
import { DEFAULT_SETTINGS, parseSettings } from "../lib/settings";

const AREAS = [
  { name: "Práca", color: "indigo", icon: "briefcase" },
  { name: "Zdravie", color: "emerald", icon: "heart-pulse" },
  { name: "Financie", color: "amber", icon: "wallet" },
  { name: "Domov", color: "rose", icon: "house" },
  { name: "Učenie", color: "violet", icon: "graduation-cap" },
] as const;

async function main() {
  const db = await getDb();
  const email = (process.env.ALLOWED_EMAIL ?? "dev@localhost").toLowerCase();

  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    const id = uuidv7();
    await db.insert(users).values({
      id,
      email,
      name: "Richard",
      settings: DEFAULT_SETTINGS,
    });
    user = await db.query.users.findFirst({ where: eq(users.email, email) });
    console.log(`✓ Vytvorený používateľ ${email}`);
  }
  if (!user) throw new Error("Používateľa sa nepodarilo vytvoriť.");

  /**
   * Dnešok berieme z pásma používateľa, nie z pásma procesu ani z UTC.
   * Cez `toISOString()` by sa po polnoci lokálneho času všetky ukážkové
   * úlohy posunuli o deň dozadu — /dnes by bola prázdna a priorita dňa by
   * sedela na inom dni, než pre ktorý ju `setFrog` stráži.
   */
  const settings = parseSettings(user.settings);
  const todayIso = todayIn(settings.timezone);
  const isoDate = (offsetDays: number): string => addDays(todayIso, offsetDays);

  // Mäkko zmazané oblasti sa nesmú počítať za existujúce — inak by seed
  // priradil nové úlohy oblasti, ktorú používateľ v UI ani nevidí.
  const existingAreas = await db.query.areas.findMany({
    where: and(eq(areas.userId, user.id), isNull(areas.deletedAt)),
  });

  const areaIds = new Map<string, string>();
  for (const a of existingAreas) areaIds.set(a.name, a.id);

  for (const [i, a] of AREAS.entries()) {
    if (areaIds.has(a.name)) continue;
    const id = uuidv7();
    await db.insert(areas).values({
      id,
      userId: user.id,
      name: a.name,
      color: a.color,
      icon: a.icon,
      sort: i,
    });
    areaIds.set(a.name, id);
    console.log(`✓ Oblasť ${a.name}`);
  }

  // Bez `deletedAt IS NULL` by seed po zmazaní ukážkových úloh tvrdil,
  // že dáta existujú, a používateľ by ostal s prázdnou aplikáciou.
  const taskCount = await db.$count(
    tasks,
    and(eq(tasks.userId, user.id), isNull(tasks.deletedAt)),
  );
  if (taskCount > 0) {
    console.log(`• Úlohy už existujú (${taskCount}), preskakujem ukážkové dáta.`);
    console.log("Hotovo.");
    return;
  }

  const samples = [
    {
      title: "Nastaviť Google OAuth pre task manažér",
      status: "todo" as const,
      priority: 1,
      plannedDate: isoDate(0),
      horizon: "day" as const,
      estimateMin: 30,
      energy: "mid" as const,
      context: "@pocitac",
      area: "Práca",
      isFrog: true,
    },
    {
      title: "Prejsť si dátový model v PLAN.md",
      status: "todo" as const,
      priority: 2,
      plannedDate: isoDate(0),
      horizon: "day" as const,
      estimateMin: 15,
      energy: "high" as const,
      context: "@pocitac",
      area: "Práca",
    },
    {
      title: "Vyskúšať rýchle zachytenie s parsovaním",
      status: "todo" as const,
      priority: 3,
      plannedDate: isoDate(1),
      horizon: "week" as const,
      estimateMin: 5,
      energy: "low" as const,
      area: "Učenie",
    },
    {
      title: "Naplánovať týždeň v nedeľu večer",
      status: "todo" as const,
      priority: 2,
      plannedDate: isoDate(3),
      horizon: "week" as const,
      estimateMin: 15,
      area: "Práca",
    },
    {
      title: "Odovzdať daňové priznanie",
      status: "todo" as const,
      priority: 1,
      dueDate: isoDate(21),
      horizon: "month" as const,
      estimateMin: 120,
      energy: "high" as const,
      area: "Financie",
    },
    {
      title: "Kúpiť nové bežecké topánky",
      status: "inbox" as const,
      priority: 3,
      horizon: "someday" as const,
      area: "Zdravie",
    },
    {
      title: "Zistiť, či sa dá PGlite zálohovať do OneDrive",
      status: "inbox" as const,
      priority: 3,
      horizon: "week" as const,
    },
  ];

  for (const [i, s] of samples.entries()) {
    const { area, ...rest } = s;
    await db.insert(tasks).values({
      id: uuidv7(),
      userId: user.id,
      areaId: area ? (areaIds.get(area) ?? null) : null,
      sort: i,
      ...rest,
    });
  }
  console.log(`✓ ${samples.length} ukážkových úloh`);
  console.log("Hotovo.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
