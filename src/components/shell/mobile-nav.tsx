"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { NAV_ITEMS, isNavItemActive, type NavCounts } from "./sidebar";

function badgeFor(href: string, counts: NavCounts): { value: number; tone: "accent" | "danger"; label: string } | null {
  if (href === "/dnes" && counts.overdue > 0) {
    return { value: counts.overdue, tone: "danger", label: `${counts.overdue} po termíne` };
  }
  if (href === "/inbox" && counts.inbox > 0) {
    return { value: counts.inbox, tone: "accent", label: `${counts.inbox} nezatriedených` };
  }
  return null;
}

/**
 * Spodná lišta pre telefón. Zobrazuje sa len pod `md`, kde je skrytý sidebar.
 * Spodné odsadenie rešpektuje výrez (gesture bar na iPhone aj Androide).
 */
export function MobileNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hlavná navigácia"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-sm md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isNavItemActive(pathname, href);
          const badge = badgeFor(href, counts);

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 text-[11px]",
                  "transition-colors duration-100 ease-out",
                  active ? "font-medium text-accent" : "text-fg-subtle active:text-fg",
                )}
              >
                <span className="relative inline-flex">
                  <Icon className="size-[18px]" />
                  {badge ? (
                    <span
                      aria-label={badge.label}
                      className={cn(
                        "absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center",
                        "rounded-full px-1 text-[10px] font-semibold tabular-nums text-accent-fg",
                        badge.tone === "danger" ? "bg-danger" : "bg-accent",
                      )}
                    >
                      {badge.value}
                    </span>
                  ) : null}
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
