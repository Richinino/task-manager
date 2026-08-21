"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  FolderKanban,
  Hourglass,
  Inbox,
  Layers,
  LayoutTemplate,
  Lightbulb,
  LogOut,
  Search,
  Settings,
  Sprout,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SignOutForm } from "@/components/shell/sign-out-form";

import { ThemeToggle } from "./theme-toggle";

/** Počty pre odznaky v navigácii — presne to, čo vracia `getCounts()`. */
export interface NavCounts {
  inbox: number;
  today: number;
  overdue: number;
  /**
   * Koľko vecí leží v „Niekedy". Zámerne sa nikde nezobrazuje — viac
   * pri `NAV_ITEMS`. V type ostáva, aby sedel s tým, čo vracia `getCounts()`.
   */
  someday: number;
  waiting: number;
}

/**
 * Do ktorej polovice navigácie položka patrí.
 *
 * `day` je to, čo otvoríš každý deň bez rozmýšľania. `structure` sú miesta,
 * kam chodíš vedome — pri plánovaní a pri revízii. Rozdelenie nie je kozmetika:
 * deväť rovnocenných položiek by z navigácie spravilo zoznam, v ktorom sa
 * denná práca stratí medzi archívmi.
 */
export type NavGroup = "day" | "structure";

/** Ktoré číslo z `NavCounts` sa má pri položke ukázať. */
export type NavBadgeKey = "overdue" | "inbox" | "waiting";

export interface NavItem {
  href: Route;
  label: string;
  /** Tichý náznak klávesovej skratky. */
  shortcut: string;
  Icon: LucideIcon;
  group: NavGroup;
  badge?: NavBadgeKey;
  /**
   * Je položka v spodnej lište na telefóne?
   *
   * Je to ZÁMERNE iná otázka než `group`. `group` hovorí, čo tá obrazovka
   * znamená (a podľa toho sa delí bočný panel), `bar` hovorí, či sa zmestila
   * medzi štyri miesta, na ktoré dosiahne palec. Kým to bolo jedno pole,
   * nedalo sa vytiahnuť Projekty do lišty bez toho, aby sa v paneli
   * presťahovali medzi dennú prácu, kam nepatria.
   */
  bar?: true;
}

/**
 * Jediný zdroj pravdy pre navigáciu — používa ho bočný panel, spodná lišta
 * na telefóne, paleta príkazov aj globálne klávesové skratky.
 *
 * **Skratky:** musia byť voľné písmená bez modifikátora. `n` patrí zachyteniu,
 * `j`, `k`, `x` a číslice si berie triedenie v inboxe — preto `s` (someday)
 * pre „Niekedy" a `c` pre „Čaká sa na". „Nápady" dostali `a`: prvé písmeno `n`
 * má rýchle zachytenie a `i` (idea) drží Inbox, takže ostáva druhé písmeno
 * slova — voľné vo všetkých troch registroch (navigácia, zachytenie, triedenie).
 * „Návyky" idú tou istou cestou o písmeno ďalej: `n` je obsadené, druhé `á`
 * nie je klávesa, ktorá by sa dala stlačiť na každom rozložení, takže ostáva
 * `v` z náVyky — voľné a bez modifikátora. „Archív" dostal `h` z hľadania:
 * `a` si vzali Nápady a hľadanie je aj tak to, čím sa na tú obrazovku chodí.
 * „Šablóny" majú `b` zo šaBlóny: `š` nie je klávesa dostupná na každom
 * rozložení a `s` drží „Niekedy", takže ostáva druhá spoluhláska slova.
 *
 * **Odznaky:** len tam, kde číslo znamená „konaj". Po termíne a nezatriedené
 * volajú po akcii dnes, „čaká sa na" pripomína, že niekomu treba pripomenúť.
 * „Niekedy" ani „Nápady" číslo zámerne nemajú: zásobáreň je prirodzene veľká
 * a trvalo dvojciferný odznak naučí človeka prehliadať všetky odznaky vrátane
 * tých, na ktorých záleží. Z navigácie sa nesmie stať semafor.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dnes",
    label: "Dnes",
    shortcut: "t",
    Icon: CalendarCheck,
    group: "day",
    badge: "overdue",
    bar: true,
  },
  {
    href: "/tyzden",
    label: "Týždeň",
    shortcut: "w",
    Icon: CalendarRange,
    group: "day",
    bar: true,
  },
  { href: "/mesiac", label: "Mesiac", shortcut: "m", Icon: CalendarDays, group: "day" },
  {
    href: "/inbox",
    label: "Inbox",
    shortcut: "i",
    Icon: Inbox,
    group: "day",
    badge: "inbox",
    bar: true,
  },
  {
    href: "/projekty",
    label: "Projekty",
    shortcut: "p",
    Icon: FolderKanban,
    group: "structure",
    /*
      V lište napriek tomu, že patrí do štruktúry: projekt sa zakladá
      a otvára často, a spod „Viac" to boli tri ťuknutia. Miesto uvoľnil
      „Mesiac" — mesačný pohľad je vec plánovania, nie behu dňa, a otvára
      sa rádovo menej.
    */
    bar: true,
  },
  {
    href: "/oblasti",
    label: "Oblasti",
    shortcut: "o",
    Icon: Layers,
    group: "structure",
  },
  {
    href: "/navyky",
    label: "Návyky",
    shortcut: "v",
    Icon: Sprout,
    group: "structure",
  },
  /*
    Hneď za návykmi zámerne: obidve obrazovky sú o veciach, ktoré sa opakujú.
    Rozdiel je v tom, že návyk sa udržuje a nikdy sa nedokončí, kým šablóna
    vysype hotové úlohy, ktoré sa dokončiť dajú — vedľa seba je ten rozdiel
    najlepšie vidieť.
  */
  {
    href: "/sablony",
    label: "Šablóny",
    shortcut: "b",
    Icon: LayoutTemplate,
    group: "structure",
  },
  { href: "/niekedy", label: "Niekedy", shortcut: "s", Icon: Archive, group: "structure" },
  {
    href: "/caka-sa-na",
    label: "Čaká sa na",
    shortcut: "c",
    Icon: Hourglass,
    group: "structure",
    badge: "waiting",
  },
  {
    href: "/napady",
    label: "Nápady",
    shortcut: "a",
    Icon: Lightbulb,
    group: "structure",
  },
  /*
    Lupa, nie truhlica: `Archive` už patrí položke „Niekedy" a dva takmer
    rovnaké piktogramy v jednom stĺpci by sa len pliedli. Navyše sa na túto
    obrazovku chodí hľadať — archív je to, čo tam človek nájde, nie to, čo
    tam ide robiť.
  */
  {
    href: "/archiv",
    label: "Archív",
    shortcut: "h",
    Icon: Search,
    group: "structure",
  },
];

/* ── skupiny bočného panela (podľa významu) ────────────────────────────── */

/** Denná práca. */
export const PRIMARY_NAV: readonly NavItem[] = NAV_ITEMS.filter(
  (item) => item.group === "day",
);

/** Štruktúra a odkladiská. */
export const SECONDARY_NAV: readonly NavItem[] = NAV_ITEMS.filter(
  (item) => item.group === "structure",
);

/* ── spodná lišta na telefóne (podľa dosahu palca) ─────────────────────── */

/** Štyri miesta v lište. Piate si berie „Viac". */
export const BAR_NAV: readonly NavItem[] = NAV_ITEMS.filter((item) => item.bar === true);

/** Všetko ostatné — vysunie sa v hárku nad lištou. */
export const SHEET_NAV: readonly NavItem[] = NAV_ITEMS.filter((item) => item.bar !== true);

/** Nadpis druhej skupiny v bočnom paneli. */
export const SECONDARY_NAV_LABEL = "Štruktúra a odkladiská";

/** Nadpis prvej skupiny. V paneli sa nekreslí, v mobilnom hárku áno. */
export const PRIMARY_NAV_LABEL = "Deň";

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Je práve otvorená obrazovka, ktorá v spodnej lište nie je?
 *
 * Podľa toho sa rozsvieti „Viac" — inak by človek pri otvorenom Mesiaci
 * alebo Archíve nevidel v lište nič aktívne a nevedel by, kde je.
 */
export function isSheetActive(pathname: string): boolean {
  return SHEET_NAV.some((item) => isNavItemActive(pathname, item.href));
}

/* ═══════════════════════════════════════════════════════════════════════════
   ODZNAKY
   ═══════════════════════════════════════════════════════════════════════════ */

export interface NavBadgeData {
  value: number;
  tone: "neutral" | "danger";
  /** Celá veta pre čítačku — číslo samo o sebe nič nehovorí. */
  label: string;
}

/** Slovenské skloňovanie: 1 · 2–4 · 0 a 5+. */
function pluralSk(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  if (count >= 2 && count <= 4) return few;
  return many;
}

/** Číslo k položke, alebo `null`, keď niet čo hlásiť. Nula sa nezobrazuje nikdy. */
export function navBadge(item: NavItem, counts: NavCounts): NavBadgeData | null {
  switch (item.badge) {
    case "overdue":
      return counts.overdue > 0
        ? {
            value: counts.overdue,
            tone: "danger",
            label: `${counts.overdue} po termíne`,
          }
        : null;
    case "inbox":
      return counts.inbox > 0
        ? {
            value: counts.inbox,
            tone: "neutral",
            label: `${counts.inbox} nezatriedených`,
          }
        : null;
    case "waiting":
      return counts.waiting > 0
        ? {
            value: counts.waiting,
            tone: "neutral",
            label: `${counts.waiting} ${pluralSk(
              counts.waiting,
              "vec čaká",
              "veci čakajú",
              "vecí čaká",
            )} na niekoho iného`,
          }
        : null;
    default:
      return null;
  }
}

function NavBadge({ badge }: { badge: NavBadgeData }) {
  return (
    <span
      title={badge.label}
      aria-label={badge.label}
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1",
        "text-[10px] font-semibold tabular-nums",
        badge.tone === "danger"
          ? "bg-danger/10 text-danger"
          : "bg-surface-2 text-fg-muted",
      )}
    >
      {badge.value}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOČNÝ PANEL
   ═══════════════════════════════════════════════════════════════════════════ */

interface NavListProps {
  items: readonly NavItem[];
  counts: NavCounts;
  pathname: string;
  /** Menovka zoznamu pre čítačky. */
  label?: string;
  /** Alternatíva k `label` — odkaz na viditeľný nadpis skupiny. */
  labelledBy?: string;
}

function NavList({ items, counts, pathname, label, labelledBy }: NavListProps) {
  return (
    <ul
      className="flex flex-col gap-0.5"
      aria-label={label}
      aria-labelledby={labelledBy}
    >
      {items.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        const badge = navBadge(item, counts);
        const Icon = item.Icon;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
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
              <span className="min-w-0 flex-1 truncate">{item.label}</span>

              {badge ? <NavBadge badge={badge} /> : null}

              <span
                aria-hidden="true"
                className="kbd opacity-0 transition-opacity duration-100 group-hover:opacity-100"
              >
                {item.shortcut}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export interface SidebarProps {
  user: { name: string | null; email: string };
  counts: NavCounts;
  signOutAction: () => Promise<void>;
}

/**
 * Pripnutý bočný panel. Pod `md` sa skrýva — tam preberá úlohu
 * spodná lišta (`mobile-nav.tsx`).
 *
 * Dvanásť položiek v jednom stĺpci by bola kaša, preto sú v dvoch skupinách
 * oddelených čiarou a nadpisom: hore to, čo otváraš denne, dole miesta,
 * kam chodíš vedome. Panel má na to miesto, ktoré telefón nemá — tam sa
 * druhá skupina schová za „Viac".
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
        <NavList
          items={PRIMARY_NAV}
          counts={counts}
          pathname={pathname}
          label="Denná práca"
        />

        <div className="my-2 h-px bg-border" />

        <h2
          id="nav-struktura"
          className="truncate px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle"
        >
          {SECONDARY_NAV_LABEL}
        </h2>
        <NavList
          items={SECONDARY_NAV}
          counts={counts}
          pathname={pathname}
          labelledBy="nav-struktura"
        />
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
          <div className="flex items-center gap-1">
            {/*
              Nastavenia patria sem, nie medzi `NAV_ITEMS`. Nie je to miesto,
              kam sa chodí pracovať — v mobilnom hárku „Viac" by tlačili von
              obrazovky, ktoré sa používajú denne.
            */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/nastavenia"
                  aria-label="Nastavenia"
                  aria-current={pathname === "/nastavenia" ? "page" : undefined}
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded",
                    "text-fg-muted transition-colors duration-100 ease-out",
                    "hover:bg-surface-2 hover:text-fg",
                    pathname === "/nastavenia" && "bg-surface-2 text-fg",
                  )}
                >
                  <Settings className="size-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="top">Nastavenia</TooltipContent>
            </Tooltip>

            <SignOutForm action={signOutAction}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="submit" variant="ghost" size="icon" aria-label="Odhlásiť sa">
                    <LogOut className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Odhlásiť sa</TooltipContent>
              </Tooltip>
            </SignOutForm>
          </div>
        </div>
      </div>
    </aside>
  );
}
