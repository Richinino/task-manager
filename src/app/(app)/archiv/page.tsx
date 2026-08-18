import type { Metadata } from "next";
import { Search } from "lucide-react";

import { ArchiveFilter } from "@/components/views/archiv/archive-filter";
import {
  archiveKindsFor,
  readArchiveFilter,
  readSearchQuery,
  type ArchiveFilterValue,
} from "@/components/views/archiv/archive-filters";
import { ArchiveList, type ArchiveEntry } from "@/components/views/archiv/archive-list";
import { ExportCard } from "@/components/views/archiv/export-card";
import { SearchField } from "@/components/views/archiv/search-field";
import { SearchResults } from "@/components/views/archiv/search-results";
import { requireUser } from "@/server/auth-guard";
import { getArchivedIdeas, getArchivedTasks } from "@/server/queries/archive";
import { search } from "@/server/queries/search";

export const metadata: Metadata = {
  title: "Archív",
  description: "Nájdi staré veci, vráť zmazané a vezmi si dáta von.",
};

interface ArchivPageProps {
  /** Next 16: `searchParams` je Promise a musí sa awaitovať. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Prvý riadok textu, orezaný.
 *
 * V zozname má byť náznak, po ktorom človek vec spozná — nie celá poznámka.
 * Trojriadková poznámka by z každého riadku spravila odsek a zo zoznamu stenu.
 */
function excerpt(text: string | null, max = 120): string | null {
  if (text === null) return null;

  const line = text.trim().split("\n")[0]?.trim() ?? "";
  if (line === "") return null;

  return line.length > max ? `${line.slice(0, max).trimEnd()}…` : line;
}

/** Koľko vecí leží v ktorej priehradke. Čísla idú do prepínača. */
function countByFilter(
  entries: readonly ArchiveEntry[],
): Record<ArchiveFilterValue, number> {
  const counts: Record<ArchiveFilterValue, number> = {
    vsetko: entries.length,
    hotove: 0,
    zahodene: 0,
    zmazane: 0,
  };

  for (const entry of entries) {
    if (entry.reason === "done") counts.hotove += 1;
    else if (entry.reason === "dropped") counts.zahodene += 1;
    else counts.zmazane += 1;
  }

  return counts;
}

/**
 * Obrazovka archívu a hľadania.
 *
 * Jediné miesto v appke, kde sa dá dostať k tomu, čo už nie je na žiadnej
 * obrazovke. Mäkké mazanie máme od M0, ale doteraz ho nič nečítalo — zahodená
 * úloha teda existovala a zároveň bola nedosiahnuteľná, čo je horšie než tvrdé
 * mazanie: o takej veci človek ani nevie.
 *
 * Dopyt aj priehradka sú v adrese (`?q=` a `?druh=`). Vďaka tomu sa výsledok dá
 * poslať odkazom, tlačidlo späť sa vráti k tomu, čo človek videl, a celá
 * obrazovka funguje aj bez JavaScriptu — pole hľadania je obyčajný `GET`
 * formulár.
 */
export default async function ArchivPage({ searchParams }: ArchivPageProps) {
  const user = await requireUser();
  const params = await searchParams;

  const query = readSearchQuery(params.q);
  const filter = readArchiveFilter(params.druh);

  const [hits, archivedTasks, archivedIdeas] = await Promise.all([
    // Prázdny aj jednoznakový dopyt vráti `search()` prázdny sám — nemá zmysel
    // to obchádzať tu druhým `if`.
    search(user.id, query),
    /*
      Zámerne bez `kinds`: prepínač ukazuje pri každej priehradke číslo a to sa
      nedá zistiť z výberu, ktorý ostatné druhy do výsledku vôbec nepustí.
      Dotaz je aj tak zastropovaný a rozdelenie do priehradiek je jedno
      prejdenie poľa.
    */
    getArchivedTasks(user.id),
    getArchivedIdeas(user.id),
  ]);

  /*
    Dátum skladá server a ku klientovi ide ako hotový text.

    Pásmo z nastavení, nie pásmo servera: ten beží v UTC a vec uzavretá o pol
    jedenástej večer by sa vypísala ako nasledujúci deň. Je to tá istá pasca,
    kvôli ktorej sa dnešok všade posiela propom.
  */
  const dateFormat = new Intl.DateTimeFormat("sk-SK", {
    timeZone: user.settings.timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  /*
    Úlohy a nápady do jedného zoznamu, od naposledy zmenených. Čas radenia sa
    nesie zvlášť a ku klientovi sa neposiela — tam už netreba nič dopočítavať.
  */
  const rows: { at: number; entry: ArchiveEntry }[] = [
    ...archivedTasks.map((task) => ({
      at: task.updatedAt.getTime(),
      entry: {
        type: "task",
        id: task.id,
        title: task.title,
        reason: task.archiveKind,
        excerpt: excerpt(task.note),
        changedLabel: dateFormat.format(task.updatedAt),
      } satisfies ArchiveEntry,
    })),
    ...archivedIdeas.map((idea) => ({
      at: idea.updatedAt.getTime(),
      entry: {
        type: "idea",
        id: idea.id,
        title: idea.title,
        reason: idea.archiveKind,
        excerpt: excerpt(idea.body),
        changedLabel: dateFormat.format(idea.updatedAt),
      } satisfies ArchiveEntry,
    })),
  ].sort((a, b) => b.at - a.at);

  const entries = rows.map((row) => row.entry);
  const counts = countByFilter(entries);

  const kinds = archiveKindsFor(filter);
  const visible = entries.filter((entry) => kinds.includes(entry.reason));

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6 px-4 py-5 md:px-6 md:py-7">
      <header className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Search aria-hidden="true" className="size-[18px] shrink-0 text-fg-subtle" />
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg">
            Archív a hľadanie
          </h1>
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Miesto, kde sa dá nájsť to, čo už nie je na žiadnej obrazovke. Hľadá naprieč
          úlohami, nápadmi, projektmi, oblasťami aj denníkom — vrátane uzavretých
          a zmazaných.
        </p>
      </header>

      <SearchField query={query} filter={filter} />
      <SearchResults query={query} hits={hits} />

      <section aria-labelledby="archiv-nadpis" className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <h2
            id="archiv-nadpis"
            className="text-sm font-semibold tracking-tight text-fg"
          >
            Archív
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
            Nič sa tu nemaže natvrdo. Zmazané veci tu ležia dovtedy, kým ich nevrátiš
            späť — a keď ich nevrátiš, nikomu neprekážajú.
          </p>
        </div>

        <ArchiveFilter active={filter} query={query} counts={counts} />
        <ArchiveList entries={visible} filter={filter} />
      </section>

      <ExportCard />
    </div>
  );
}
