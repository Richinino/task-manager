"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Lightbulb, LoaderCircle, Sparkles } from "lucide-react";

import { CaptureChips, type CaptureMode } from "@/components/capture/capture-chips";
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
import type { SyntaxEdit } from "@/lib/capture-syntax";
import { formatLongSk } from "@/lib/dates";
import { parseCapture, type ParsedCapture } from "@/lib/parse";
import { cn } from "@/lib/utils";
import { createIdea } from "@/server/actions/ideas";
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
 *
 * **Dva ciele, jedno okno.** Prepínač v rade čipov rozhoduje, či z textu vznikne
 * úloha (`quickCapture`), alebo nápad (`createIdea`). Úloha je záväzok, nápad je
 * možnosť — a keďže sa zachytávajú tou istou klávesou `n` a tým istým poľom,
 * musí byť rozdiel vidieť naraz na štyroch miestach: ikona pri poli, zapnutá
 * strana prepínača, nápoveda pod poľom a text tlačidla.
 *
 * **Nápad offline nefunguje.** Fronta v `@/lib/outbox` vie odosielať iba
 * `quickCapture`; nápad by v nej nemal kam ísť. Namiesto tichého zahodenia
 * (alebo prehltnutia úlohou) sa zachytenie zrozumiteľne odmietne a text ostane
 * v poli — známe obmedzenie, nie chyba.
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

/**
 * Presne to, čo parser vie. Krátka pripomienka, nie dokumentácia.
 *
 * Prvé dva tvary majú dopísané, čo znamenajú: „do 31.3." si nikto sám od seba
 * neprečíta ako termín a rozdiel medzi plánom a termínom je jadro celej appky.
 * Energia tu chýbala úplne — parser ju vedel, ale nikde to nebolo napísané.
 */
const SYNTAX_HINT =
  "v piatok → plán · do 31.3. → termín · !1 · !!vysoka · 30m · @pocitac · #tag · +projekt";
/**
 * To isté pre úzku obrazovku. Celá pripomienka sa na 375 px zalomí do dvoch
 * riadkov a odtlačí tlačidlo „Uložiť" nižšie — práve tam, kam si na telefóne
 * sadne klávesnica. Prioritu, energiu, termín aj odhad tam už ponúkajú čipy,
 * takže ostáva to jediné, čo sa inak než napísaním nastaviť nedá.
 */
const SYNTAX_HINT_SHORT = "v piatok → plán · do 31.3. → termín";

/**
 * Nápoveda v režime nápadu. Namiesto syntaxe hovorí to jediné, čo je tu
 * podstatné: nápad nie je záväzok a uloží sa z neho len názov. Značky parsera
 * by tu boli návod na sklamanie — server ich zahodí.
 */
const IDEA_HINT = "nápad je možnosť, nie záväzok · uloží sa len názov, bez dátumov a priority";
const IDEA_HINT_SHORT = "nápad = možnosť · uloží sa len názov";

/**
 * Nápad sa bez pripojenia odložiť nedá — fronta pozná iba `quickCapture`.
 * Radšej to povedať rovno, než ho ticho stratiť alebo z neho spraviť úlohu.
 */
const IDEA_OFFLINE_ERROR = "Nápad sa bez pripojenia uložiť nedá, skús to znova online.";

export function QuickCapture({
  open,
  onOpenChange,
  weekStartsOn = 1,
  defaultDate,
  defaultText,
}: QuickCaptureProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Úloha, alebo nápad. Predvolene úloha — to je to, čo sa zachytáva najčastejšie. */
  const [mode, setMode] = useState<CaptureMode>("task");
  /**
   * `queued` = odložené do fronty, ešte to nevidel server. `mode` si hláška
   * nesie so sebou: prepnutie prepínača nesmie prepísať, čo sa pred chvíľou
   * naozaj uložilo.
   */
  const [saved, setSaved] = useState<{
    title: string;
    queued: boolean;
    mode: CaptureMode;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Kam patrí kurzor po ťuknutí na čip. Počítadlo sa zvyšuje pri každom
   * ťuknutí — aj vtedy, keď text ostal rovnaký (napr. ťuknutie na hodnotu,
   * ktorá už v texte je) sa musí fokus vrátiť do poľa.
   */
  const caretRef = useRef<number | null>(null);
  const [caretNonce, setCaretNonce] = useState(0);

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
    // Aj režim je súčasťou čistého okna: `n` má vždy začať pri úlohe, inak by
    // sa raz prepnutý nápad ticho niesol do ďalšieho zachytenia.
    setMode("task");
  }, [open, defaultText]);

  /*
    Po ťuknutí na čip sa fokus vracia do poľa a kurzor za vložený token — bez
    toho by človek po každom čipe klikal späť do textu. Robí sa to až v efekte:
    v obsluhe udalosti má input v DOM-e ešte starý text a kurzor by sadol vedľa.
  */
  useEffect(() => {
    if (caretNonce === 0) return;
    const el = inputRef.current;
    const caret = caretRef.current;
    if (el === null || caret === null) return;
    el.focus();
    const pos = Math.max(0, Math.min(caret, el.value.length));
    el.setSelectionRange(pos, pos);
  }, [caretNonce]);

  /**
   * Text z čipu ide do toho istého stavu ako písanie — živý náhľad parsera sa
   * preto prekreslí sám a čipy nedržia žiadny súbežný stav navyše.
   */
  function applyEdit(edit: SyntaxEdit): void {
    /*
      `applyToken` vracia text zámerne bez medzery na konci — je to čistý
      reťazec, nie rozpísané pole. Lenže tu ide rovno do inputu a človek po
      ťuknutí na čip väčšinou píše ďalej. Bez medzery by sa písmeno nalepilo
      na token a `!1x` už parser ako prioritu neprečíta — celý token by ticho
      spadol do názvu úlohy. Preto ju doplníme, ak token skončil na konci.
      Pri ukladaní sa text aj tak oreže, takže vo výsledku po nej niet stopy.
    */
    const atEnd = edit.cursor === edit.text.length;
    const text = atEnd ? edit.text + " " : edit.text;

    setValue(text);
    if (saved !== null) setSaved(null);
    if (error !== null) setError(null);
    caretRef.current = atEnd ? text.length : edit.cursor;
    setCaretNonce((n) => n + 1);
  }

  /**
   * Prepnutie cieľa. Text ostáva — práve preto, že sa človek často rozhodne
   * až po napísaní, že to nie je záväzok, ale možnosť. Chyba z predchádzajúceho
   * pokusu ide preč: platila pre iný cieľ.
   */
  function changeMode(next: CaptureMode): void {
    setMode(next);
    if (error !== null) setError(null);
  }

  function save(keepOpen: boolean): void {
    const raw = value.trim();
    if (raw === "" || isPending) return;

    /*
      Samotné tokeny nie sú úloha. Po ťuknutí na čipy do prázdneho poľa je text
      napríklad „!1 !!vysoka" — neprázdny, ale po vybratí tokenov z neho neostane
      názov. Bez tejto kontroly by sa odoslal a server by ho odmietol až potom;
      offline by dokonca ticho spadol do fronty a zahodil sa až pri odosielaní.
    */
    if (parsed !== null && parsed.title.trim() === "") {
      setError(
        mode === "idea"
          ? "Napíš aj názov nápadu — zo samotných značiek nápad nevznikne."
          : "Napíš aj názov úlohy — samotný termín ani priorita nestačia.",
      );
      inputRef.current?.focus();
      return;
    }

    /** Spoločný koniec pre uložené aj odložené — jedno miesto, jedno správanie. */
    function finish(title: string, queued: boolean): void {
      setValue("");
      if (keepOpen) {
        setSaved({ title, queued, mode });
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

      if (mode === "idea") {
        /*
          Nápad nemá kam ísť bez pripojenia — fronta pozná iba `quickCapture`.
          Odmietneme ho nahlas a text necháme v poli, nech sa nestratí.
        */
        if (outbox !== null && !outbox.online) {
          setError(IDEA_OFFLINE_ERROR);
          inputRef.current?.focus();
          return;
        }

        /*
          Názov berieme z parsera, nie z holého textu: `createIdea` žiadny
          parser nemá, takže „!1" alebo „do 31.3." by ostali v názve nápadu
          ako smeti. Že sa značky stratili, hovorí náhľad ešte pred uložením.
        */
        const title = parseCapture(raw, { weekStartsOn }).title.trim();
        if (title === "") {
          setError("Napíš aj názov nápadu — zo samotných značiek nápad nevznikne.");
          inputRef.current?.focus();
          return;
        }

        try {
          const result = await createIdea({ title });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          finish(title, false);
        } catch {
          // Výnimka je sieťová chyba a fronta nápad neunesie — späť k človeku.
          setError(IDEA_OFFLINE_ERROR);
        }
        return;
      }

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

  const idea = mode === "idea";
  /** Ikona pri poli je prvá vec, ktorú oko chytí — musí hovoriť, čo sa ukladá. */
  const LeadIcon = idea ? Lightbulb : Sparkles;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        aria-label="Rýchle zachytenie"
        /*
          Pod `sm` sedí okno tesne pri hornom okraji, nie v strede obrazovky.
          Vysunutá klávesnica na Androide neposunie rozloženie stránky, len
          prekryje jej spodok — a 12 vh navrchu je presne toľko, koľko chýba
          na to, aby tlačidlo „Uložiť" ostalo nad ňou. Od `sm` je okno tam,
          kde bolo.
        */
        className="mt-3 max-w-2xl overflow-hidden p-0 sm:mt-[12vh]"
      >
        <DialogTitle className="sr-only">
          {idea ? "Rýchle zachytenie nápadu" : "Rýchle zachytenie úlohy"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {idea
            ? `Napíš nápad jednou vetou. Uloží sa iba názov — nápad nemá dátum, prioritu
               ani odhad. Prepínačom Úloha a Nápad sa dá cieľ kedykoľvek zmeniť. Enter
               uloží, Ctrl a Enter uloží a nechá okno otvorené, Escape zruší.`
            : `Napíš úlohu jednou vetou. Deň, termín, prioritu, odhad, projekt aj štítky
               rozpozná systém sám. Prepínačom Úloha a Nápad sa dá namiesto úlohy uložiť
               nápad. Enter uloží, Ctrl a Enter uloží a nechá okno otvorené, Escape zruší.
               Uložiť sa dá aj tlačidlom Uložiť pod poľom.`}
        </DialogDescription>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            save(false);
          }}
        >
          <div className="flex items-center gap-2 px-3 pt-1">
            <LeadIcon
              aria-hidden="true"
              className={cn("size-4 shrink-0", idea ? "text-accent" : "text-fg-subtle")}
            />
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
              placeholder={idea ? "Čo ťa napadlo?" : "Čo treba spraviť?"}
              aria-label={idea ? "Text nápadu" : "Text úlohy"}
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
            idea ? (
              /* Nápad deň neunesie. Predvyplnenie by sa ticho stratilo — povedzme to. */
              <p className="pb-1 pl-9 pr-3 text-[12px] text-warn">
                Predvyplnený deň ({formatLongSk(defaultDate)}) sa do nápadu neuloží —
                nápad nemá dátum.
              </p>
            ) : (
              <p className="pb-1 pl-9 pr-3 text-[12px] text-fg-muted">
                Predvyplnený deň: {formatLongSk(defaultDate)} — deň napísaný
                v texte má prednosť.
              </p>
            )
          ) : null}

          {/* Náhľad sa objaví, až keď parser naozaj niečo našiel. */}
          <ParsePreview parsed={parsed} mode={mode} className="pb-1 pl-9 pr-3" />

          {/*
            Čipy sú medzi náhľadom a nápovedou zámerne: nad nimi je vidieť, čo
            už parser rozpoznal, pod nimi to, čo sa dá dopísať ručne.
          */}
          <CaptureChips
            text={value}
            onEdit={applyEdit}
            mode={mode}
            onModeChange={changeMode}
            weekStartsOn={weekStartsOn}
            className="pb-1 pl-9 pr-3"
          />

          <div className="border-t border-border bg-surface-2 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <p
                className={cn(
                  "min-w-0 font-mono text-[11px]",
                  // Nápoveda nápadu nesie akcent — je to štvrtý signál o tom,
                  // že sa neukladá úloha.
                  idea ? "font-medium text-accent" : "text-fg-subtle",
                )}
              >
                <span className="sm:hidden">{idea ? IDEA_HINT_SHORT : SYNTAX_HINT_SHORT}</span>
                <span className="hidden sm:inline">{idea ? IDEA_HINT : SYNTAX_HINT}</span>
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
                  // Prázdny názov po vybratí tokenov znamená, že uložiť sa nedá —
                  // tlačidlo to má povedať vopred, nie až server po odoslaní.
                  disabled={trimmed === "" || parsed?.title.trim() === "" || isPending}
                  className="h-11 min-w-[5.5rem] px-4 sm:h-8 sm:min-w-0 sm:px-3 sm:text-[13px]"
                >
                  {idea ? "Uložiť nápad" : "Uložiť"}
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
                {saved.queued
                  ? "Odošle sa po pripojení: "
                  : saved.mode === "idea"
                    ? "Nápad uložený: "
                    : "Uložené: "}
                {saved.title}
              </p>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
