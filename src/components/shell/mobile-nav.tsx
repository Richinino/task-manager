"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { useCapture } from "@/components/capture/capture-provider";

import { cn } from "@/lib/utils";

import {
  MOBILE_BAR_LEFT,
  MOBILE_BAR_RIGHT,
  isMobileBarItemActive,
  navBadge,
  type MobileBarItem,
  type NavCounts,
} from "./sidebar";

/* ═══════════════════════════════════════════════════════════════════════════
   SPODNÁ LIŠTA

   Päť miest: Dnes, Plán, „+", Inbox, Knižnica. Zvyšok aplikácie sedí za
   Plánom (časové pohľady) a Knižnicou (štruktúra, odkladiská, nastavenia),
   takže každá obrazovka je najviac na dve ťuknutia a žiadny hárok „Viac"
   netreba.

   Aktívna položka je tmavá tabletka s ikonou a názvom vedľa seba, ostatné
   majú ikonu nad názvom. Tabletka dostane dvojnásobok šírky, aby sa názov
   „Knižnica" zmestil aj na 360 px.

   Výšku lišty drží `--bar-height` v `globals.css`; `--bar-inset` k nej
   pripočíta výrez telefónu.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Bodka, nie číslo: lišta má povedať „pozri sa sem", nie „koľko". Číslo nesie
 * `sr-only` text, takže čítačka povie „Inbox, 3 nezatriedené".
 */
function BarDot({ item, counts }: { item: MobileBarItem; counts: NavCounts }) {
  const badge = navBadge(item, counts);
  if (!badge) return null;

  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "absolute right-[calc(50%-18px)] top-2 size-[7px] rounded-full ring-2 ring-bg",
          badge.tone === "danger" ? "bg-danger" : "bg-accent",
        )}
      />
      <span className="sr-only">{badge.label}</span>
    </>
  );
}

function BarLink({
  item,
  counts,
  pathname,
}: {
  item: MobileBarItem;
  counts: NavCounts;
  pathname: string;
}) {
  const active = isMobileBarItemActive(pathname, item);
  const Icon = item.Icon;

  return (
    <li className={cn("min-w-0", active ? "flex-[2]" : "flex-1")}>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className="relative flex h-[var(--bar-height)] w-full items-center justify-center"
      >
        {active ? (
          <span className="flex h-10 max-w-full items-center gap-1.5 rounded-full bg-accent px-4 text-meta font-semibold text-accent-fg">
            <Icon aria-hidden="true" className="size-[18px] shrink-0" />
            <span className="truncate">{item.label}</span>
          </span>
        ) : (
          <span className="flex max-w-full flex-col items-center gap-0.5 text-fg-subtle">
            <Icon aria-hidden="true" className="size-[22px]" />
            <span className="max-w-full truncate text-mini font-medium">{item.label}</span>
          </span>
        )}
        {active ? null : <BarDot item={item} counts={counts} />}
      </Link>
    </li>
  );
}

/**
 * Spodná lišta pre telefón. Zobrazuje sa len pod `md`, kde je skrytý sidebar.
 * Spodné odsadenie rešpektuje výrez (gesture bar na iPhone aj Androide).
 */
export function MobileNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  const { openCapture } = useCapture();

  return (
    <nav
      aria-label="Hlavná navigácia"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg md:hidden"
    >
      <ul className="flex items-center px-2">
        {MOBILE_BAR_LEFT.map((item) => (
          <BarLink key={item.href} item={item} counts={counts} pathname={pathname} />
        ))}

        <li className="flex shrink-0 justify-center px-1.5">
          <button
            type="button"
            onClick={() => openCapture()}
            aria-label="Zachytiť úlohu"
            className="inline-flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg transition-opacity duration-100 active:opacity-80"
          >
            <Plus aria-hidden="true" className="size-6" />
          </button>
        </li>

        {MOBILE_BAR_RIGHT.map((item) => (
          <BarLink key={item.href} item={item} counts={counts} pathname={pathname} />
        ))}
      </ul>
    </nav>
  );
}
