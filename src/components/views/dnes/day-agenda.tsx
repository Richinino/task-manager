import { AgendaRow } from "@/components/agenda/agenda-row";
import type { AgendaItemRow } from "@/server/queries/agenda";

/* ═══════════════════════════════════════════════════════════════════════════
   UDALOSTI NA „DNES"

   Dve sekcie, dva rôzne otázky:

   - **Udalosti dňa** hneď pod prioritou dňa — čím je deň pevne daný
     (písomka o 9:50, zubár o 16:30). Sú to fakty, nie rozhodnutia, preto
     bez zaškrtávania.
   - **Blíži sa** na 14 dní — koľko času ostáva na prípravu. Odpočet, nie
     dátum, lebo presne na to sa človek pri písomke pýta.

   Prázdna sekcia sa nekreslí: „dnes nič" je šum na obrazovke, ktorú človek
   otvára každé ráno.
   ═══════════════════════════════════════════════════════════════════════════ */

function Header({ id, label, count }: { id: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-[9px] md:px-5">
      <h2 id={id} className="font-mono text-micro font-medium uppercase tracking-[0.14em] text-fg-muted">
        {label}
      </h2>
      <span className="font-mono text-micro text-fg-subtle">{count}</span>
    </div>
  );
}

export function DayAgenda({ items, todayIso }: { items: AgendaItemRow[]; todayIso: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="dnes-udalosti">
      <Header id="dnes-udalosti" label="Udalosti dňa" count={items.length} />
      {items.map((item) => (
        <AgendaRow key={item.id} item={item} todayIso={todayIso} variant="today" />
      ))}
    </section>
  );
}

export function UpcomingAgenda({ items, todayIso }: { items: AgendaItemRow[]; todayIso: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="dnes-blizi-sa">
      <Header id="dnes-blizi-sa" label="Blíži sa · 14 dní" count={items.length} />
      {items.map((item) => (
        <AgendaRow key={item.id} item={item} todayIso={todayIso} variant="upcoming" />
      ))}
    </section>
  );
}
