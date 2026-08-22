import type { Route } from "next";
import Link from "next/link";
import { CornerUpLeft, FolderKanban, Layers, Lightbulb, ListChecks, NotebookPen } from "lucide-react";

import type { BacklinkView } from "@/components/task/task-detail-data";

/**
 * Čo odkazuje SEM.
 *
 * Druhá polovica odkazov `[[…]]`. Bez nej vedú len jedným smerom: vidíš, na
 * čo úloha odkazuje, ale nie čo od nej závisí — a práve to je otázka, kvôli
 * ktorej sa odkazy oplatí písať.
 *
 * Zoznam sa nekreslí, keď je prázdny. Nadpis „Odkazuje sem" nad prázdnom
 * hovorí „nič sem neodkazuje", čo je informácia, ktorú nikto nehľadal.
 */
export interface BacklinksProps {
  items: readonly BacklinkView[];
}

/**
 * Kam ktorý druh vedie.
 *
 * Úloha ani nápad vlastnú adresu nemajú — ich detail sa otvára panelom, takže
 * odkaz vedie na obrazovku, kde ich človek nájde. Rovnako to robí `WikiLinkText`
 * aj výsledky hľadania; lepšie mať to všade rovnako než vymýšľať adresy,
 * ktoré nikam nevedú.
 */
const CIEL: Record<BacklinkView["kind"], { href: (id: string) => Route; Icon: typeof ListChecks }> = {
  task: { href: () => "/dnes" as Route, Icon: ListChecks },
  idea: { href: () => "/napady" as Route, Icon: Lightbulb },
  area: { href: () => "/oblasti" as Route, Icon: Layers },
  journal: { href: () => "/archiv" as Route, Icon: NotebookPen },
  project: { href: (id) => `/projekty/${id}` as Route, Icon: FolderKanban },
};

export function Backlinks({ items }: BacklinksProps) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="label flex items-center gap-1.5 text-fg-subtle">
        <CornerUpLeft aria-hidden="true" size={12} className="shrink-0" />
        Odkazuje sem
      </h3>

      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const { href, Icon } = CIEL[item.kind];
          return (
            <li key={`${item.kind}-${item.id}`}>
              <Link
                href={href(item.id)}
                className="flex min-h-11 items-center gap-2 rounded px-2 text-body text-fg-muted transition-colors duration-100 ease-out hover:bg-surface-2 hover:text-fg md:min-h-8"
              >
                <Icon aria-hidden="true" size={13} className="shrink-0 text-fg-subtle" />
                <span className="min-w-0 truncate">{item.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
