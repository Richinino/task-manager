import { Download } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT

   Obyčajný odkaz, nie tlačidlo s `onClick`. Stiahnuť súbor vie prehliadač sám
   od nepamäti; `fetch` a `URL.createObjectURL` by k tomu pridali len ďalší
   JavaScript, ktorý sa má ako pokaziť — a zálohu treba najviac práve vtedy,
   keď sa niečo pokazilo.

   `/api/export` je route handler, nie stránka, takže ho `typedRoutes` nepozná
   a `<Link>` by sa sem ani nehodil: toto nie je navigácia po appke, ale odchod
   dát von.
   ═══════════════════════════════════════════════════════════════════════════ */

export function ExportCard() {
  return (
    <section aria-labelledby="export-nadpis" className="min-w-0">
      <Card>
      <h2
        id="export-nadpis"
        className="text-sm font-semibold tracking-tight text-fg"
      >
        Export
      </h2>

      <p className="mt-1 text-body leading-relaxed text-fg-muted">
        Jeden súbor JSON so všetkým, čo v appke máš: úlohy aj s históriou a podúlohami,
        nápady, projekty, oblasti, štítky, návyky, denník, revízie, šablóny a odkazy —
        vrátane mäkko zmazaných.
      </p>
      <p className="mt-1 text-meta leading-relaxed text-fg-subtle">
        Je to záloha pre prípad, že by appka zajtra zhorela, nie prehľad na čítanie.
        Poverenia ku Googlu v ňom zámerne nie sú.
      </p>

      <a
        href="/api/export"
        download
        className={cn(
          "mt-3 inline-flex min-h-11 items-center gap-1.5 rounded border border-border bg-surface px-4 sm:min-h-9 sm:px-3",
          "text-sm font-medium text-fg transition-colors duration-100 ease-out",
          "hover:border-border-strong hover:bg-surface-2",
        )}
      >
        <Download aria-hidden="true" size={15} className="shrink-0" />
        Stiahnuť zálohu
      </a>
      </Card>
    </section>
  );
}
