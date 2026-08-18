import {
  FolderKanban,
  Layers,
  Lightbulb,
  ListTodo,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";

import type { SearchKind } from "@/server/queries/search";

/* ═══════════════════════════════════════════════════════════════════════════
   ČÍM SA DRUHY ZÁSAHOV ODLIŠUJÚ

   Vo výsledkoch hľadania stoja vedľa seba úlohy, nápady, projekty, oblasti aj
   zápisy z denníka. Bez rozlíšenia je to jeden zoznam textov, v ktorom človek
   netuší, kam ho kliknutie odnesie — a preto do neho neklikne.

   Ikona aj štítok, nie len jedno z toho: ikona sa dá prečítať periférne pri
   preletení zoznamu, slovo funguje pre čítačku aj pre farbosleposť.

   Ikony sú zámerne tie isté, aké nesú položky navigácie (`NAV_ITEMS`) — nový
   piktogram pre tú istú vec by bol druhý jazyk v tej istej appke.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface KindMark {
  Icon: LucideIcon;
  label: string;
}

export const KIND_MARKS: Record<SearchKind, KindMark> = {
  task: { Icon: ListTodo, label: "Úloha" },
  idea: { Icon: Lightbulb, label: "Nápad" },
  project: { Icon: FolderKanban, label: "Projekt" },
  area: { Icon: Layers, label: "Oblasť" },
  journal: { Icon: NotebookPen, label: "Denník" },
};
