import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { fold } from "@/lib/fold";
import { cn } from "@/lib/utils";
import { parseWikiLinks } from "@/lib/wikilink";

/* ═══════════════════════════════════════════════════════════════════════════
   TEXT S ODKAZMI [[…]]

   Vykreslí používateľský text tak, že rozpoznané `[[odkazy]]` sú odkazy a
   všetko ostatné ostáva presne tým, čím bolo — vrátane zalomení riadkov.

   **Nikdy `dangerouslySetInnerHTML`.** Je to obsah, ktorý si človek sám
   napísal, takže tu nejde o cudzieho útočníka; ide o to, že poznámka
   s `<b>` alebo `<script>` v texte má zostať poznámkou s takým textom, nie
   sa nečakane premeniť na formátovanie. Skladá sa preto z uzlov Reactu, ktorý
   text escapuje sám.

   Nerozpoznaný odkaz sa NEZAHADZUJE ani neskrýva. Ostane napísaný aj so
   zátvorkami, len slabším odtieňom — je to pozvánka, nie chyba: v deň, keď
   entita s tým názvom vznikne, sa z toho istého textu stane odkaz.

   Komponent zámerne nemá `"use client"`. Nemá stav ani obsluhu udalostí,
   takže sa dá vložiť do serverovej stránky aj do klientského panelu.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Na čo odkaz ukazuje.
 *
 * Vlastný zoznam, nie typ z `@/db/schema`: komponent môže skončiť
 * v klientskom balíku a schéma so sebou ťahá celý drizzle. Sú to tie isté
 * hodnoty ako `entity_type`, takže dáta zo servera sa priradia bez pretypovania.
 */
export type WikiLinkKind = "task" | "idea" | "project" | "area" | "journal";

export interface WikiLinkTarget {
  kind: WikiLinkKind;
  id: string;
  /**
   * SKUTOČNÝ názov entity. Páruje sa cez `fold`, takže `[[byt]]` trafí
   * oblasť „Byt" aj úlohu „Byť lepší" — presne ako hľadanie.
   *
   * Tvar sedí na `LinkTarget` z `@/server/queries/links`, takže stačí
   * `[...(await resolveLinkTargets(...)).values()]` — žiadne pretypovanie.
   */
  name: string;
}

export interface WikiLinkTextProps {
  /** Pôvodný text tak, ako ho človek napísal. */
  text: string;
  /** Entity, ktoré sa pre odkazy v texte našli. Ostatné ostanú textom. */
  targets: readonly WikiLinkTarget[];
  className?: string;
}

/**
 * Kam ktorý druh vedie.
 *
 * Úloha ani nápad vlastnú adresu nemajú — ich detail sa otvára panelom
 * z obrazovky, takže odkaz vedie na obrazovku, kde ich človek nájde. To isté
 * robia výsledky hľadania a je lepšie mať to rovnako na oboch miestach než
 * vymýšľať odkazy, ktoré nikam nevedú.
 */
const SCREEN_HREF: Record<Exclude<WikiLinkKind, "project">, Route> = {
  task: "/dnes",
  idea: "/napady",
  area: "/oblasti",
  journal: "/dnes",
};

/*
  Odkaz vnútri vety nemôže mať dotykový cieľ 44 px — roztrhal by riadkovanie
  odseku. Pravidlo `min-h-11` platí pre ovládacie prvky, nie pre text; namiesto
  výšky preto dostane zvislé odsadenie a podčiarknutie, aby sa dal trafiť
  a bol vidieť aj bez farby.
*/
const LINK_CLASS = cn(
  "rounded-sm px-0.5 py-0.5 text-accent underline decoration-1 underline-offset-2",
  "transition-colors duration-100 ease-out hover:bg-accent-soft",
);

/** Nerozpoznaný odkaz: rovnaký text, slabší odtieň, žiadne prekvapenie. */
const DEAD_CLASS = "text-fg-subtle";

export function WikiLinkText({ text, targets, className }: WikiLinkTextProps) {
  /*
    Mapa sa stavia pri každom vykreslení nanovo. Zámerne bez `useMemo` —
    hook by z komponentu spravil klientský a cieľov je pár; postaviť mapu
    z desiatich položiek je lacnejšie než ju porovnávať.
  */
  const byName = new Map<string, WikiLinkTarget>();
  for (const target of targets) {
    const key = fold(target.name);
    // Pri zhode názvov vyhráva prvý — poradie určuje server, nie náhoda.
    if (!byName.has(key)) byName.set(key, target);
  }

  const found = parseWikiLinks(text);
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const link of found) {
    if (link.start > cursor) {
      parts.push(<span key={`text-${cursor}`}>{text.slice(cursor, link.start)}</span>);
    }

    const target = byName.get(fold(link.label));
    if (target === undefined) {
      parts.push(
        <span
          key={`dead-${link.start}`}
          className={DEAD_CLASS}
          title="Zatiaľ nič s takým názvom neexistuje. Odkaz ožije, keď vznikne."
        >
          {link.raw}
        </span>,
      );
    } else if (target.kind === "project") {
      // Jediná entita s vlastnou adresou. Šablóna v `href` musí ostať priamo
      // tu, inak by ju typované cesty nevedeli overiť.
      parts.push(
        <Link
          key={`link-${link.start}`}
          href={`/projekty/${target.id}`}
          className={LINK_CLASS}
        >
          {link.label}
        </Link>,
      );
    } else {
      parts.push(
        <Link
          key={`link-${link.start}`}
          href={SCREEN_HREF[target.kind]}
          className={LINK_CLASS}
        >
          {link.label}
        </Link>,
      );
    }

    cursor = link.end;
  }

  if (cursor < text.length) {
    parts.push(<span key={`text-${cursor}`}>{text.slice(cursor)}</span>);
  }

  return (
    <span
      className={cn(
        // Zalomenia z poznámky sú súčasťou textu; dlhé slovo sa na 375 px
        // musí zlomiť, inak by odsek pretiekol von z karty.
        "min-w-0 whitespace-pre-wrap break-words",
        className,
      )}
    >
      {parts}
    </span>
  );
}
