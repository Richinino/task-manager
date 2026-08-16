import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  areas,
  habitEntries,
  habits,
  ideas,
  journal,
  links,
  projects,
  reviews,
  taggables,
  tags,
  taskEvents,
  tasks,
  templates,
} from "@/db/schema";
import { getCurrentUser } from "@/server/auth-guard";

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT

   Jeden JSON so všetkým. Nie CSV: úlohy majú podúlohy, štítky, históriu
   a vzťahy, ktoré tabuľka nezachytí. Cieľ nie je otvoriť to v Exceli, ale mať
   dáta von, keby appka zajtra zhorela.

   Obsahuje **aj mäkko zmazané** riadky — je to záloha, nie prehľad.

   NEOBSAHUJE `accounts`: poverenie ku Googlu do zálohy nepatrí. Refresh token
   v súbore v stiahnutých je presne to, čo sa raz omylom pošle ďalej.
   ═══════════════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (user === null) {
    return new Response("Neprihlásený.", { status: 401 });
  }

  try {
    const db = await getDb();

    const [
      userTasks,
      userTaskEvents,
      userIdeas,
      userProjects,
      userAreas,
      userTags,
      userHabits,
      userJournal,
      userReviews,
      userTemplates,
      userLinks,
    ] = await Promise.all([
      db.select().from(tasks).where(eq(tasks.userId, user.id)),
      db.select().from(taskEvents).where(eq(taskEvents.userId, user.id)),
      db.select().from(ideas).where(eq(ideas.userId, user.id)),
      db.select().from(projects).where(eq(projects.userId, user.id)),
      db.select().from(areas).where(eq(areas.userId, user.id)),
      db.select().from(tags).where(eq(tags.userId, user.id)),
      db.select().from(habits).where(eq(habits.userId, user.id)),
      db.select().from(journal).where(eq(journal.userId, user.id)),
      db.select().from(reviews).where(eq(reviews.userId, user.id)),
      db.select().from(templates).where(eq(templates.userId, user.id)),
      db.select().from(links).where(eq(links.userId, user.id)),
    ]);

    /*
      Dve väzobné tabuľky nemajú `userId` — `habit_entries` visí na návyku
      a `taggables` na štítku. Sťahujú sa preto až po svojich rodičoch
      a filtrujú sa podľa nich. Samostatný dotaz bez tohto filtra by do zálohy
      pribalil cudzie riadky, čo je pri exporte to posledné, čo chceme.
    */
    const habitIds = new Set(userHabits.map((habit) => habit.id));
    const tagIds = new Set(userTags.map((tag) => tag.id));

    const [allEntries, allTaggables] = await Promise.all([
      db.select().from(habitEntries),
      db.select().from(taggables),
    ]);

    const userHabitEntries = allEntries.filter((entry) => habitIds.has(entry.habitId));
    const userTaggables = allTaggables.filter((row) => tagIds.has(row.tagId));

    const payload = {
      exportedAt: new Date().toISOString(),
      format: 1,
      user: { id: user.id, email: user.email, name: user.name, settings: user.settings },
      tasks: userTasks,
      taskEvents: userTaskEvents,
      ideas: userIdeas,
      projects: userProjects,
      areas: userAreas,
      tags: userTags,
      taggables: userTaggables,
      habits: userHabits,
      habitEntries: userHabitEntries,
      journal: userJournal,
      reviews: userReviews,
      templates: userTemplates,
      links: userLinks,
    };

    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="task-manazer-${stamp}.json"`,
        // Záloha sa nikde neodkladá — obsahuje úplne všetko, čo používateľ má.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[export] Export zlyhal:", error);
    return new Response("Export sa nepodaril.", { status: 500 });
  }
}
