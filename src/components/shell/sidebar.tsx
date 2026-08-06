"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Inbox,
  LogOut,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { ThemeToggle } from "./theme-toggle";

/** Počty pre odznaky v navigácii — presne to, čo vracia `getCounts()`. */
export interface NavCounts {
  inbox: number;
  today: number;
  overdue: number;
}

export interface NavItem {
  href: Route;
  label: string;
  /** Tichý náznak klávesovej skratky. */
  shortcut: string;
  Icon: LucideIcon;
}

/** Jediný zdroj pravdy pre navigáciu — používa ho aj mobilná lišta. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dnes", label: "Dnes", shortcut: "t", Icon: CalendarCheck },
  { href: "/tyzden", label: "Týždeň", shortcut: "w", Icon: CalendarRange },
  { href: "/mesiac", label: "Mesiac", shortcut: "m", Icon: CalendarDays },
  { href: "/inbox", label: "Inbox", shortcut: "i", Icon: Inbox },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface SidebarProps {
  user: { name: string | null; email: string };
  counts: NavCounts;
  signOutAction: () => Promise<void>;
}

function NavBadge({
  value,
  tone,
  label,
}: {
  value: number;
  tone: "neutral" | "danger";
  label: string;
}) {
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1",
        "text-[10px] font-semibold tabular-nums",
        tone === "danger" ? "bg-danger/10 text-danger" : "bg-surface-2 text-fg-muted",
      )}
    >
      {value}
    </span>
  );
}

/**
 * Pripnutý bočný panel. Pod `md` sa skrýva — tam preberá úlohu
 * spodná lišta (`mobile-nav.tsx`).
 */
export function Sidebar({ user, counts, signOutAction }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[220px] shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-12 shrink-0 items-center px-3">
        <span className="truncate text-[13px] font-semibold tracking-tight text-fg">
          Task manažér
        </span>
      </div>

      <nav aria-label="Hlavná navigácia" className="flex-1 overflow-y-auto px-2 pb-2">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, shortcut, Icon }) => {
            const active = isNavItemActive(pathname, href);
            const overdueBadge = href === "/dnes" && counts.overdue > 0;
            const inboxBadge = href === "/inbox" && counts.inbox > 0;

            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-8 items-center gap-2.5 rounded px-2 text-[13px]",
                    "transition-colors duration-100 ease-out",
                    active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0",
                      active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{label}</span>

                  {overdueBadge ? (
                    <NavBadge
                      value={counts.overdue}
                      tone="danger"
                      label={`${counts.overdue} po termíne`}
                    />
                  ) : null}
                  {inboxBadge ? (
                    <NavBadge
                      value={counts.inbox}
                      tone="neutral"
                      label={`${counts.inbox} nezatriedených`}
                    />
                  ) : null}

                  <span
                    aria-hidden="true"
                    className="kbd opacity-0 transition-opacity duration-100 group-hover:opacity-100"
                  >
                    {shortcut}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-border p-2">
        <p
          title={user.email}
          className="truncate px-1.5 pb-1.5 text-[12px] text-fg-muted"
        >
          {user.name ?? user.email}
        </p>
        <div className="flex items-center justify-between gap-2">
          <ThemeToggle />
          <form action={signOutAction}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="submit" variant="ghost" size="icon" aria-label="Odhlásiť sa">
                  <LogOut className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Odhlásiť sa</TooltipContent>
            </Tooltip>
          </form>
        </div>
      </div>
    </aside>
  );
}
