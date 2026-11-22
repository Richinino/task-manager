"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/tyzden", label: "Týždeň" },
  { href: "/mesiac", label: "Mesiac" },
  { href: "/udalosti", label: "Udalosti" },
  { href: "/rozvrh", label: "Rozvrh" },
] as const;

/**
 * Prepínač medzi štyrmi pohľadmi na čas, ktoré spolu tvoria „Plán" v spodnej
 * lište telefónu. Na počítači ich nahrádza bočný panel.
 */
export function PlanTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Plán" className="h-14 px-5 py-2 md:hidden">
      <ul className="flex h-10 rounded-full bg-surface-2 p-[3px]">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[34px] items-center justify-center truncate rounded-full px-2 text-body font-semibold",
                  active ? "bg-accent text-accent-fg" : "text-fg-muted active:text-fg",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
