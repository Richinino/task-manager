import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { CaptureProvider } from "@/components/capture/capture-provider";
import { OfflineIndicator } from "@/components/pwa/offline-indicator";
import { OutboxProvider } from "@/components/pwa/outbox-provider";
import { AppShell } from "@/components/shell/app-shell";
import { PostponeGuardProvider } from "@/components/task/postpone-guard";
import { TaskDetailProvider } from "@/components/task/task-detail-provider";
import { addDays, todayIn } from "@/lib/dates";
import { requireUser } from "@/server/auth-guard";
import {
  getAreas,
  getCounts,
  getInboxTasks,
  getProjects,
  getTasksForRange,
  listContexts,
} from "@/server/queries/tasks";
import { listTags } from "@/server/queries/structure";
import { listPillars, listSkills } from "@/server/queries/learning";
import { listHabits } from "@/server/queries/habits";
import { listSubjects } from "@/server/queries/school";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const todayIso = todayIn(user.settings.timezone);
  const counts = await getCounts(user.id, todayIso);

  // Zoznamy pre výbery v paneli s detailom úlohy a pre našepkávanie
  // v zachytení. Kontexty sa odvodzujú z úloh — vlastný zoznam nikdy nebol.
  const [
    areas,
    projects,
    contexts,
    tags,
    pillars,
    learningSkills,
    habitOptions,
    predmety,
  ] = await Promise.all([
    getAreas(user.id),
    getProjects(user.id),
    listContexts(user.id),
    listTags(user.id),
    listPillars(user.id),
    listSkills(user.id),
    /*
      Návyky do výberu v detaile úlohy. Okno je jediný deň a nikto z neho
      nečíta sériu — potrebné sú len názvy, takže kratšie okno by nič
      neušetrilo a `listHabits` je jediná cesta, ktorá stráži vlastníka.
    */
    listHabits(user.id, todayIso, todayIso, { todayIso }),
    listSubjects(user.id),
  ]);

  // Zásoba pre vyhľadávanie v Ctrl+K palete: naplánované okolo dneška + inbox.
  const searchTasks = [
    ...(await getTasksForRange(user.id, addDays(todayIso, -60), addDays(todayIso, 180))),
    ...(await getInboxTasks(user.id)),
  ];

  async function signOutAction(): Promise<void> {
    "use server";
    await signOut({ redirectTo: "/prihlasenie" });
  }

  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      counts={counts}
      signOutAction={signOutAction}
    >
      {/*
        Fronta musí obaliť zachytávanie — rýchle zachytenie aj pole v dni si
        z nej berú stav pripojenia. Preto je nad `CaptureProvider`.
      */}
      <OutboxProvider>
        <CaptureProvider
          tasks={searchTasks}
          weekStartsOn={user.settings.weekStartsOn}
          projectNames={projects.map((project) => project.name)}
          contexts={contexts}
          tags={tags.map((tag) => ({ name: tag.name, taskCount: tag.taskCount }))}
          autoTagRules={user.settings.autoTagRules}
          todayIso={todayIso}
        >
          <TaskDetailProvider
            areas={areas}
            projects={projects}
            pillars={pillars.map((pillar) => ({ id: pillar.id, name: pillar.name }))}
            skills={learningSkills.map((skill) => ({
              id: skill.id,
              name: skill.name,
              pillarId: skill.pillarId,
            }))}
            habits={habitOptions.map((habit) => ({
              id: habit.id,
              title: habit.title,
            }))}
            subjects={predmety.map((s) => ({
              id: s.id,
              code: s.code,
              name: s.name,
            }))}
            todayIso={todayIso}
            postponeWarnAt={user.settings.postponeWarnAt}
            postponeBlockAt={user.settings.postponeBlockAt}
          >
            {/*
              Strážca odkladov je POD panelom detailu zámerne: jedno z jeho
              rozhodnutí („rozdeliť alebo zmenšiť") panel otvára, takže musí
              vidieť jeho kontext.
            */}
            <PostponeGuardProvider>
              {/*
                Pruh o pripojení patrí NAD obsah obrazovky, nie do rohu.
                Vyššie ho posadiť nevieme — čítať `OutboxProvider` musí a ten
                je až tu. Kým je pripojenie v poriadku, nekreslí sa vôbec,
                takže sa obrazovka nikam neposunie; keď zmizne sieť, obsah sa
                posunie o výšku pruhu a na počítači pribudne rolovanie. Je to
                lacnejšie než rozobrať poradie kontextov kvôli stavu, ktorý
                trvá minúty.
              */}
              <OfflineIndicator />
              {children}
            </PostponeGuardProvider>
          </TaskDetailProvider>
        </CaptureProvider>

      </OutboxProvider>
    </AppShell>
  );
}
