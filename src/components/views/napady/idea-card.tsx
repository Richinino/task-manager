"use client";

import Link from "next/link";
import {
  Ban,
  FolderKanban,
  Hourglass,
  RefreshCw,
  Rocket,
  Trash2,
  Undo2,
} from "lucide-react";

import { AreaDot } from "@/components/task/area-dot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IdeaWithRelations } from "@/server/queries/ideas";

import { STAGE_LABEL, touchAgeLabel } from "./idea-labels";
import { SparkMeter, SparkPicker } from "./spark-picker";

/* ═══════════════════════════════════════════════════════════════════════════
   KARTA NÁPADU

   Nápad nie je úloha — nemá termín ani prioritu, má ťah (iskru), vek a jeden
   ďalší krok. Presne tieto tri veci karta ukazuje, lebo z nich sa dá rozhodnúť
   bez otvárania čohokoľvek.

   Fázy sa menia TLAČIDLOM, nie ťahaním. Na telefóne je zoznam zvislý a ťahanie
   prstom cez dlhý zoznam je nepoužiteľné; `setIdeaStage` je pritom jedno
   kliknutie a funguje aj z klávesnice.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Fázy, ktoré smie nastaviť človek. `promoted` vzniká len povýšením. */
export type SettableStage = "raw" | "incubating" | "rejected";

export interface IdeaCardProps {
  idea: IdeaWithRelations;
  onSpark: (spark: number) => void;
  onStage: (stage: SettableStage) => void;
  onTouch: () => void;
  onPromote: () => void;
  onDelete: () => void;
}

/** Ovládacie prvky karty: palec pod `sm`, hustota od `sm`. */
const ICON_BUTTON = "size-11 sm:size-8";
const TEXT_BUTTON = "h-11 px-3 sm:h-8 sm:px-2.5";

export function IdeaCard({
  idea,
  onSpark,
  onStage,
  onTouch,
  onPromote,
  onDelete,
}: IdeaCardProps) {
  const stage = idea.effectiveStage;
  const faded = stage === "faded";
  const promoted = stage === "promoted";
  const rejected = stage === "rejected";
  const settled = promoted || rejected;

  const title = idea.title.trim();
  const nextStep = idea.nextStep?.trim() ?? "";

  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded border bg-surface px-3 py-2.5",
        "transition-colors duration-100 ease-out",
        // Vyblednutý nápad je stlmený, ale nie skrytý — je stále v hre
        // a stačí sa ho dotknúť, aby obživol. Prerušovaný okraj to hovorí
        // aj tomu, kto farby nerozlišuje.
        faded ? "border-dashed border-border opacity-80 hover:opacity-100" : "border-border",
        settled && "opacity-75 hover:opacity-100",
      )}
    >
      <p className="min-w-0 text-sm leading-snug font-medium break-words text-fg">
        {title}
      </p>

      {/* Meta riadok sa zalamuje — na 375 px sa oblasť aj vek vedľa seba
          nezmestia a `flex-wrap` je jediné, čo tam nepretečie. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-mini text-fg-muted">
        {idea.area ? (
          <AreaDot
            color={idea.area.color}
            name={idea.area.name}
            className="min-w-0 max-w-40 shrink"
          />
        ) : (
          <span className="text-fg-subtle">bez oblasti</span>
        )}

        <span className="shrink-0 whitespace-nowrap">{touchAgeLabel(idea.staleDays)}</span>

        {faded ? (
          <span className="shrink-0 whitespace-nowrap font-medium text-warn">
            vybledlo
          </span>
        ) : null}
        {rejected ? (
          <span className="shrink-0 whitespace-nowrap">zamietnuté</span>
        ) : null}
      </div>

      {/* Iskra sa dá meniť všade, kde má zmysel triediť. Na povýšenom nápade
          už netriedi nič — tam je len na čítanie. */}
      {promoted ? (
        <SparkMeter value={idea.spark} />
      ) : (
        <SparkPicker value={idea.spark} onChange={onSpark} label={title} />
      )}

      {nextStep !== "" ? (
        <p className="min-w-0 text-meta leading-snug break-words text-fg-muted">
          <span className="text-fg-subtle">Ďalší krok: </span>
          {nextStep}
        </p>
      ) : settled ? null : (
        <p className="text-mini leading-snug text-fg-subtle">
          Bez ďalšieho kroku — pri povýšení by z neho vznikla prvá úloha projektu.
        </p>
      )}

      {promoted ? (
        idea.promotedProject ? (
          <Link
            href={`/projekty/${idea.promotedProject.id}`}
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 rounded text-meta font-medium text-accent",
              "underline-offset-2 hover:underline",
            )}
          >
            <FolderKanban aria-hidden="true" size={13} className="shrink-0" />
            <span className="min-w-0 truncate">
              Projekt „{idea.promotedProject.name}“
            </span>
          </Link>
        ) : (
          <p className="text-mini leading-snug text-fg-subtle">
            Projekt, ktorý z tohto nápadu vznikol, už neexistuje.
          </p>
        )
      ) : null}

      {/* Akcie. Zalamujú sa — v úzkom stĺpci na počítači aj na telefóne. */}
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {promoted ? null : rejected ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onStage("raw")}
            aria-label={`Vrátiť nápad ${title} späť do hry`}
            title="Vrátiť späť medzi čerstvé"
            className={TEXT_BUTTON}
          >
            <Undo2 aria-hidden="true" size={14} />
            Späť do hry
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={onPromote}
              aria-label={`Povýšiť nápad ${title} na projekt`}
              title="Povýšiť na projekt — vznikne projekt aj jeho prvá úloha"
              className={TEXT_BUTTON}
            >
              <Rocket aria-hidden="true" size={14} />
              Povýšiť
            </Button>

            {/* Pri vyblednutom nápade je posun fázy vedľajší: najprv ho treba
                oživiť, a to spraví dotyk. Uložená fáza (`raw`/`incubating`)
                sa nemení, nápad sa len vráti do svojho stĺpca. */}
            {faded ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={onTouch}
                aria-label={`Prebudiť vyblednutý nápad ${title}`}
                title="Prebudiť — dotyk vráti nápad medzi živé"
                className={TEXT_BUTTON}
              >
                <RefreshCw aria-hidden="true" size={14} />
                Prebudiť
              </Button>
            ) : idea.stage === "raw" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onStage("incubating")}
                aria-label={`Poslať nápad ${title} zrieť`}
                title="Nechať zrieť — presunie nápad medzi zrejúce"
                className={ICON_BUTTON}
              >
                <Hourglass aria-hidden="true" size={15} />
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onStage("raw")}
                aria-label={`Vrátiť nápad ${title} medzi čerstvé`}
                title="Späť medzi čerstvé"
                className={ICON_BUTTON}
              >
                <Undo2 aria-hidden="true" size={15} />
              </Button>
            )}

            {faded ? null : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onTouch}
                aria-label={`Dotknúť sa nápadu ${title}`}
                title="Dotknúť sa — vynuluje vek, nápad tak nevybledne"
                className={ICON_BUTTON}
              >
                <RefreshCw aria-hidden="true" size={15} />
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onStage("rejected")}
              aria-label={`Zamietnuť nápad ${title}`}
              title="Zamietnuť — nápad ostane v zázname, len sa oň už neuchádzaš"
              className={ICON_BUTTON}
            >
              <Ban aria-hidden="true" size={15} />
            </Button>
          </>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label={`Zmazať nápad ${title}`}
          title="Zmazať — dá sa vrátiť späť hneď po zmazaní"
          className={cn(ICON_BUTTON, "text-danger hover:bg-danger/10 hover:text-danger")}
        >
          <Trash2 aria-hidden="true" size={15} />
        </Button>
      </div>

      {/* Fáza je pre čítačku aj v texte — farba ani stĺpec nie sú jediným
          nosičom informácie. */}
      <span className="sr-only">Fáza: {STAGE_LABEL[stage]}.</span>
    </li>
  );
}

/**
 * Karta nápadu, ktorý sa práve zakladá.
 *
 * Nemá akcie — kým server nevráti identifikátor, nie je čo posúvať,
 * a tlačidlo, ktoré nič nespraví, je horšie než žiadne.
 */
export function PendingIdeaCard({ title }: { title: string }) {
  return (
    <li
      aria-hidden="true"
      className="flex min-w-0 flex-col gap-1 rounded border border-dashed border-border bg-surface px-3 py-2.5 opacity-60"
    >
      <span className="min-w-0 text-sm leading-snug font-medium break-words text-fg">
        {title}
      </span>
      <span className="text-mini text-fg-subtle">zapisuje sa…</span>
    </li>
  );
}
