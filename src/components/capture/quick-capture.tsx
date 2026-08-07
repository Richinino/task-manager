"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";

import { ParsePreview } from "@/components/capture/parse-preview";
import { useOutbox } from "@/components/pwa/outbox-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { formatLongSk } from "@/lib/dates";
import { parseCapture, type ParsedCapture } from "@/lib/parse";
import { cn } from "@/lib/utils";
import { quickCapture } from "@/server/actions/tasks";

/**
 * Rýchle zachytenie — jeden riadok, do ktorého sa napíše všetko naraz.
 *
 * Klávesy:
 * - `Enter` uloží a zavrie,
 * - `Ctrl+Enter` uloží a nechá okno otvorené (dávkové zachytávanie),
 * - `Escape` zruší.
 *
 * Enter spracúva priamo `onKeyDown` na inpute — na implicitné odoslanie
 * formulára sa v dialógu spoľahnúť nedá (prehliadač ho nespustí). Tlačidlo
 * „Uložiť" je druhá, rovnocenná cesta: bez neho by sa na dotykovom zariadení
 * nedalo uložiť vôbec nič.
 *
 * Pod inputom beží živý náhľad z `parseCapture`. Ten istý text potom rozoberie
 * aj serverová akcia `quickCapture` — náhľad je len okno do toho, čo sa uloží,
 * nič sa naň neposiela.
 *
 * Bez signálu sa server nevolá vôbec: text ide do fronty (`useOutbox`) a odošle
 * sa, keď je opäť pripojenie. To isté sa stane, keď volanie spadne na sieti —
 * signál mohol vypadnúť práve v tej sekunde. Chybu validácie zo servera
 * (`{ ok: false }`) do fronty nikdy neschovávame: tá sa opakovaním nespraví,
 * a používateľ ju musí vidieť.
 */
export interface QuickCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Prvý deň týždňa pre náhľad („budúci týždeň"). Server si aj tak berie
   * hodnotu z nastavení používateľa — tu ide len o zobrazenie.
   */
  weekStartsOn?: number;
  /**
   * Deň, na ktorý sa má úloha naplánovať, keď si ho človek nenapíše do textu
   * (RRRR-MM-DD). Prichádza z tlačidla „+" na konkrétnom dni. Deň v texte
   * vyhráva — rozhoduje o tom serverová akcia, nie tento komponent.
   */
  defaultDate?: string;
  /** Text rozpísaný inde (pole v dni), aby sa pri prechode sem nestratil. */
  defaultText?: string;
}

/** Presne to, čo parser vie. Krátka pripomienka, nie dokumentácia. */
const SYNTAX_HINT = "v piatok · do 31.3. · !1 · @pocitac · #tag · +projekt · 30m";

export function QuickCapture({
  open,
  onOpenChange,
  weekStartsOn = 1,
  defaultDate,
  defaultText,
}: QuickCaptureProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** `queued` = odložené do fronty, ešte to nevidel server. */
  const [saved, setSaved] = useState<{ title: string; queued: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Mimo `OutboxProvider` je `null` — vtedy sa ukladá po starom, priamo na server.
  const outbox = useOutbox();

  const trimmed = value.trim();

  // Parser je čistá a lacná funkcia — pokojne beží pri každom znaku.
  const parsed = useMemo<ParsedCapture | null>(
    () => (trimmed === "" ? null : parseCapture(value, { weekStartsOn })),
    [value, trimmed, weekStartsOn],
  );

  /*
    Stav sa nastavuje pri OTVORENÍ, nie pri zatvorení: okno sa má zakaždým
    otvoriť buď prázdne, alebo s tým, čo doň poslal volajúci (`defaultText`
    z poľa v dni). Obsah dialógu Radix pri zatvorení odmontuje, takže sa
    dovnútra medzitým aj tak nikto nepozerá.
  */
  useEffect(() => {
    if (!open) return;
    setValue(defaultText ?? "");
    setError(null);
    setSaved(null);
  }, [open, defaultText]);

  function save(keepOpen: boolean): void {
    const raw = value.trim();
    if (raw === "" || isPending) return;

    /** Spoločný koniec pre uložené aj odložené — jedno miesto, jedno správanie. */
    function finish(title: string, queued: boolean): void {
      setValue("");
      if (keepOpen) {
        setSaved({ title, queued });
        inputRef.current?.focus();
      } else {
        onOpenChange(false);
      }
    }

    /**
     * Odloží text do fronty. Vráti `true`, ak sa to podarilo; inak nastaví
     * chybu — text musí ostať na obrazovke, nesmie sa stratiť.
     */
    async function queue(): Promise<boolean> {
      if (outbox === null) return false;
      try {
        await outbox.enqueueCapture(raw, defaultDate);
        // Server ešte nič nevrátil, tak si názov odvodíme sami — je to ten
        // istý parser, ktorý beží aj v náhľade pod poľom.
        const title = parseCapture(raw, { weekStartsOn }).title.trim();
        finish(title === "" ? raw : title, true);
        return true;
      } catch {
        return false;
      }
    }

    startTransition(async () => {
      setError(null);

      // Bez signálu server nevoláme vôbec — čakanie na vypršanie spojenia by
      // len držalo dialóg otvorený a nič by nezískalo.
      if (outbox !== null && !outbox.online) {
        if (await queue()) return;
        setError("Úlohu sa nepodarilo odložiť na neskôr. Skús to znova.");
        return;
      }

      try {
        const result = await quickCapture(raw, {
          defaultPlannedDate: defaultDate,
        });
        if (!result.ok) {
          // Chyba validácie — do fronty nepatrí, opakovanie by nepomohlo.
          setError(result.error);
          return;
        }
        finish(result.data.title, false);
      } catch {
        // Výnimka je sieťová chyba. Signál mohol vypadnúť práve teraz, tak
        // úlohu zachránime do fronty namiesto hlásenia neúspechu.
        if (await queue()) return;
        setError("Úlohu sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        aria-label="Rýchle zachytenie"
        className="mt-[12vh] max-w-2xl overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Rýchle zachytenie úlohy</DialogTitle>
        <DialogDescription className="sr-only">
          Napíš úlohu jednou vetou. Deň, termín, prioritu, odhad, projekt aj štítky
          rozpozná systém sám. Enter uloží, Ctrl a Enter uloží a nechá okno otvorené,
          Escape zruší. Uložiť sa dá aj tlačidlom Uložiť pod poľom.
        </DialogDescription>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            save(false);
          }}
        >
          <div className="flex items-center gap-2 px-3 pt-1">
            <Sparkles aria-hidden="true" className="size-4 shrink-0 text-fg-subtle" />
            <Input
              ref={inputRef}
              autoFocus
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (saved !== null) setSaved(null);
                if (error !== null) setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                /*
                  Enter obsluhujeme sami, oba varianty.

                  Na implicitné odoslanie formulára sa tu spoľahnúť NEDÁ:
                  formulár žije v portáli dialógu a prehliadač ho pri Enteri
                  neodošle — overené na bežiacej aplikácii, `submit` sa vôbec
                  nespustí, hoci nikto nevolá preventDefault. Bez tejto vetvy
                  by rýchle zachytenie neuložilo nič.
                */
                // Enter, ktorým sa potvrdzuje kandidát z IME, nie je uloženie.
                if (event.nativeEvent.isComposing) return;
                event.preventDefault();
                // Ctrl/Cmd+Enter = ulož a nechaj okno otvorené (dávkové písanie).
                save(event.ctrlKey || event.metaKey);
              }}
              placeholder="Čo treba spraviť?"
              aria-label="Text úlohy"
              autoComplete="off"
              spellCheck={false}
              /* Fokusový krúžok necháme na globálne `:focus-visible`. */
              className={cn("h-12 border-0 bg-transparent px-0 text-lg", "hover:border-0")}
            />
            {isPending ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin text-fg-subtle"
              />
            ) : null}
          </div>

          {/*
            Keď okno otvorilo tlačidlo „+" na konkrétnom dni, musí byť vidieť,
            kam sa úloha chystá — inak by sa deň priradil ticho a človek by
            netušil, prečo mu úloha pribudla práve tam.
          */}
          {defaultDate !== undefined ? (
            <p className="pb-1 pl-9 pr-3 text-[12px] text-fg-muted">
              Predvyplnený deň: {formatLongSk(defaultDate)} — deň napísaný
              v texte má prednosť.
            </p>
          ) : null}

          {/* Náhľad sa objaví, až keď parser naozaj niečo našiel. */}
          <ParsePreview parsed={parsed} className="pb-2 pl-9 pr-3" />

          <div className="border-t border-border bg-surface-2 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <p className="min-w-0 font-mono text-[11px] text-fg-subtle">
                {SYNTAX_HINT}
              </p>

              <div className="flex shrink-0 items-center gap-2">
                {/* Klávesová nápoveda dáva zmysel len tam, kde je klávesnica. */}
                <p
                  aria-hidden="true"
                  className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-subtle sm:flex"
                >
                  <span className="inline-flex items-center gap-1">
                    <Kbd>↵</Kbd> uložiť
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Kbd>Ctrl</Kbd>
                    <Kbd>↵</Kbd> uložiť a písať ďalej
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Kbd>Esc</Kbd> zrušiť
                  </span>
                </p>

                {/*
                  Skutočné tlačidlo, nie ozdoba: na dotykovom zariadení je to
                  jediná cesta, ako úlohu uložiť. Preto má na mobile plnú
                  dotykovú plochu (44 × 44 px) a na väčších obrazovkách sa
                  stiahne, aby neprekrikovalo klávesovú skratku.
                */}
                <Button
                  type="submit"
                  variant="primary"
                  disabled={trimmed === "" || isPending}
                  className="h-11 min-w-[5.5rem] px-4 sm:h-8 sm:min-w-0 sm:px-3 sm:text-[13px]"
                >
                  Uložiť
                </Button>
              </div>
            </div>

            {error !== null ? (
              <p role="alert" className="mt-1.5 text-[12px] font-medium text-danger">
                {error}
              </p>
            ) : saved !== null ? (
              <p
                role="status"
                className={cn(
                  "mt-1.5 truncate text-[12px]",
                  saved.queued ? "text-warn" : "text-success",
                )}
              >
                {saved.queued ? "Odošle sa po pripojení: " : "Uložené: "}
                {saved.title}
              </p>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
