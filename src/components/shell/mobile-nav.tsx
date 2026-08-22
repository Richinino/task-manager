"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Ellipsis, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  BAR_NAV,
  PRIMARY_NAV_LABEL,
  SECONDARY_NAV_LABEL,
  SHEET_NAV,
  isNavItemActive,
  isSheetActive,
  navBadge,
  type NavCounts,
  type NavItem,
} from "./sidebar";

/* ═══════════════════════════════════════════════════════════════════════════
   SPODNÁ LIŠTA

   Dvanásť obrazoviek sa do spodnej lišty nezmestí — rozumný strop je päť
   položiek (na 375 px to je 75 px na stĺpec). Štyri z nich sú obrazovky,
   na ktoré sa chodí najčastejšie, piata je „Viac" a vysunie zvyšok v hárku
   tesne nad lištou. Každá obrazovka je tak najviac na dve ťuknutia.

   Čo je v lište, hovorí pole `bar` v `NAV_ITEMS` — NIE skupina. Sú to dve
   rôzne otázky: skupina hovorí, čo obrazovka znamená, `bar` to, či na ňu
   dosiahne palec. Preto sú v lište aj Projekty (zakladajú sa často) a Mesiac
   z nej vypadol (plánovacia obrazovka, otvára sa rádovo menej).

   Hárok „Viac" je zoskupený rovnako ako bočný panel, takže Mesiac v ňom
   nesedí medzi archívmi, ale pod vlastným nadpisom. Strop `60dvh` a vlastné
   rolovanie: ani na nízkej obrazovke nemôže prerásť cez celú stránku.

   Výšku lišty drží `--bar-height` v `globals.css`. Dovtedy to bola tá istá
   konštanta opísaná na štyroch nezávislých miestach (tu, v `app-shell`,
   v plávajúcom tlačidle zachytenia a v indikátore pripojenia) — stačilo
   zmeniť tri z nich a posledné riadky zoznamu skončili pod lištou.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Poradie skupín v hárku „Viac" — rovnaké ako v bočnom paneli. */
const SHEET_GROUPS = [
  { key: "day", label: PRIMARY_NAV_LABEL },
  { key: "structure", label: SECONDARY_NAV_LABEL },
] as const;

function BarBadge({ item, counts }: { item: NavItem; counts: NavCounts }) {
  const badge = navBadge(item, counts);
  if (!badge) return null;

  return (
    <span
      aria-label={badge.label}
      className={cn(
        "absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center",
        "rounded-full px-1 font-mono text-micro font-medium tabular-nums text-accent-fg",
        badge.tone === "danger" ? "bg-danger" : "bg-accent",
      )}
    >
      {badge.value}
    </span>
  );
}

/** Spoločný tvar tlačidla aj odkazu v lište — 56 px na výšku, celý stĺpec. */
const BAR_ITEM = cn(
  "flex h-14 w-full flex-col items-center justify-center gap-1 px-1 text-mini",
  "transition-colors duration-100 ease-out",
);

/**
 * Spodná lišta pre telefón. Zobrazuje sa len pod `md`, kde je skrytý sidebar.
 * Spodné odsadenie rešpektuje výrez (gesture bar na iPhone aj Androide).
 */
export function MobileNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const sheetActive = isSheetActive(pathname);

  /* Prechod na inú obrazovku hárok zavrie — inak by ostal visieť nad novým obsahom. */
  useEffect(() => {
    // Preverená výnimka: hárok sa zatvára pri zmene adresy. Zatvorenie v
    // `onClick` odkazu by minulo navigáciu klávesovou skratkou aj tlačidlom
    // späť — práve tie prípady, kvôli ktorým efekt vznikol.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  /* Po otvorení patrí fokus prvej položke, nie tlačidlu pod hárkom. */
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [open]);

  /* Escape zavrie a vráti fokus tam, odkiaľ prišiel. */
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      {/*
        Závoj je súrodenec lišty, nie jej potomok: `backdrop-blur` na lište
        robí z nej blok, voči ktorému by sa `fixed` potomok umiestňoval —
        závoj by sa scvrkol na veľkosť lišty a stránku by nezatienil.

        `z-40` je rovnaká hladina ako plávajúce tlačidlo zachytenia a indikátor
        pripojenia, ale závoj je v DOM až za nimi, takže ich prekryje. Lišta
        s otvoreným hárkom ide na `z-50` a ostáva čitateľná nad závojom.
      */}
      {open ? (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-fg/25 backdrop-blur-[2px] md:hidden dark:bg-bg/75"
        />
      ) : null}

      <nav
        aria-label="Hlavná navigácia"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        className={cn(
          "fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 backdrop-blur-sm md:hidden",
          open ? "z-50" : "z-40",
        )}
      >
        <ul className="grid grid-cols-5">
          {BAR_NAV.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const Icon = item.Icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    BAR_ITEM,
                    active ? "font-medium text-accent" : "text-fg-subtle active:text-fg",
                  )}
                >
                  <span className="relative inline-flex">
                    <Icon className="size-[18px]" />
                    <BarBadge item={item} counts={counts} />
                  </span>
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}

          <li>
            <button
              ref={triggerRef}
              type="button"
              aria-expanded={open}
              aria-controls="mobile-nav-viac"
              aria-label="Viac — ďalšie obrazovky"
              onClick={() => setOpen((current) => !current)}
              className={cn(
                BAR_ITEM,
                // Otvorený hárok aj otvorená obrazovka z druhej skupiny musia
                // byť vidieť: inak človek nevie, kde v aplikácii vlastne je.
                open || sheetActive
                  ? "font-medium text-accent"
                  : "text-fg-subtle active:text-fg",
              )}
            >
              <span className="relative inline-flex">
                <Ellipsis className="size-[18px]" />
              </span>
              <span className="max-w-full truncate">Viac</span>
            </button>
          </li>
        </ul>

        {/*
          Hárok je potomok lišty, ale posadený `absolute bottom-full` presne nad
          ňu — nikdy ju teda neprekryje a lišta neprekryje jeho. V DOM je až za
          zoznamom, takže ho čítačka prečíta hneď po tlačidle „Viac".
        */}
        {open ? (
          <div
            ref={panelRef}
            id="mobile-nav-viac"
            aria-labelledby="mobile-nav-viac-title"
            className={cn(
              "animate-in-fast absolute inset-x-0 bottom-full max-h-[60dvh] overflow-y-auto overscroll-contain",
              "rounded-t border-x border-t border-border bg-surface p-1.5 shadow-md",
            )}
          >
            {/*
              Hárok je zoskupený rovnako ako bočný panel. Bez toho by „Mesiac"
              sedel medzi archívmi a odkladiskami, kam významom nepatrí.
              Skupina bez položiek sa vôbec nevykreslí — nadpis nad prázdnom
              je horší než žiadny.
            */}
            {SHEET_GROUPS.map((group, groupIndex) => {
              const items = SHEET_NAV.filter((item) => item.group === group.key);
              if (items.length === 0) return null;

              return (
                <div key={group.key}>
            <h2
              id={groupIndex === 0 ? "mobile-nav-viac-title" : undefined}
              className="label truncate px-2 pb-1 pt-1 text-fg-subtle"
            >
              {group.label}
            </h2>

            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                const badge = navBadge(item, counts);
                const Icon = item.Icon;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        // 44 px dotykový cieľ cez celú šírku hárku.
                        "flex min-h-11 items-center gap-3 rounded px-2 text-sm",
                        "transition-colors duration-100 ease-out",
                        active
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-fg active:bg-surface-2",
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "size-[18px] shrink-0",
                          active ? "text-accent" : "text-fg-subtle",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {badge ? (
                        <Badge
                          aria-label={badge.label}
                          tone={badge.tone === "danger" ? "danger" : "neutral"}
                          className="shrink-0"
                        >
                          {badge.value}
                        </Badge>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
                </div>
              );
            })}

            {/*
              Nastavenia sú oddelené čiarou, lebo nie sú obrazovka na prácu.
              V hárku ale byť MUSIA: na telefóne je bočný panel skrytý a bez
              tohto by sa na Androide k nastaveniam nedalo dostať vôbec.
              Sú mimo skupín — inak by sa zopakovali pod každou.
            */}
            <ul className="flex flex-col gap-0.5">
              <li className="mt-1 border-t border-border pt-1">
                <Link
                  href="/nastavenia"
                  aria-current={pathname === "/nastavenia" ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded px-2 text-sm",
                    "transition-colors duration-100 ease-out",
                    pathname === "/nastavenia"
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-fg active:bg-surface-2",
                  )}
                >
                  <Settings
                    aria-hidden="true"
                    className={cn(
                      "size-[18px] shrink-0",
                      pathname === "/nastavenia" ? "text-accent" : "text-fg-subtle",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">Nastavenia</span>
                </Link>
              </li>
            </ul>
          </div>
        ) : null}
      </nav>
    </>
  );
}
