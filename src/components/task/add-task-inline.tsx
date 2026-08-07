"use client";

import { useRef, useState, useTransition, type ComponentProps } from "react";
import { Check, LoaderCircle, Plus } from "lucide-react";

import { useCaptureOptional } from "@/components/capture/capture-provider";
import { useOutbox } from "@/components/pwa/outbox-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatLongSk } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { createTask } from "@/server/actions/tasks";

/**
 * Pridanie úlohy priamo na konkrétny deň.
 *
 * Dovtedy sa dala úloha založiť iba globálnym rýchlym zachytením (klávesa `n`)
 * a deň sa musel napísať slovami do textu. Pri plánovaní týždňa je to naopak:
 * deň človek vie (pozerá sa naň) a chce doň nasypať úlohy jednu za druhou.
 *
 * Preto dve cesty, obe z toho istého miesta:
 *
 * 1. **Pole v dni** — Enter uloží a pole ostane otvorené pre ďalšiu úlohu,
 *    Escape zavrie. Ukladá cez `createTask`, teda bez parsera: čo napíšeš,
 *    to je názov. Deň dodá volajúci.
 * 2. **„viac"** — otvorí plné rýchle zachytenie s predvyplneným dňom, takže
 *    je k dispozícii celý parser (priorita, odhad, kontext, projekt, štítky).
 *
 * Komponent nekreslí, čo pribudlo — optimistický riadok si vykreslí rodič
 * cez `onOptimisticAdd`. Stĺpec týždňa a bunka mesiaca ho totiž kreslia úplne
 * inak a spoločný tvar by nesedel ani jednému.
 *
 * Dátum sa tu nikdy nepočíta — prichádza propom zo servera (`todayIso` a spol.
 * sú tam z toho istého dôvodu). Klient len formátuje, čo dostal.
 */

/**
 * Deň v akuzatíve — „na stredu", nie „na streda".
 *
 * `formatLongSk` vracia nominatív („streda 5. augusta"), lenže po predložke
 * „na" sa nominatív použiť nedá a čítačka by prečítala kostrbatinu. Ženské dni
 * (streda, sobota, nedeľa) menia koncové -a na -u, mužské (pondelok, utorok,
 * štvrtok, piatok) ostávajú, ako sú. Mesiac je už v genitíve a nemení sa.
 */
function formatDayAccusativeSk(iso: string): string {
  const label = formatLongSk(iso);
  const space = label.indexOf(" ");
  if (space === -1) return label;

  const day = label.slice(0, space);
  if (!day.endsWith("a")) return label;
  return `${day.slice(0, -1)}u${label.slice(space)}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TLAČIDLO „+"
   ═══════════════════════════════════════════════════════════════════════════ */

export type AddTaskButtonProps = Omit<ComponentProps<"button">, "children"> & {
  /** Deň, na ktorý sa bude pridávať — RRRR-MM-DD. Ide aj do `aria-label`. */
  date: string;
  /** `sm` je pre tesnú bunku mesiaca; aj tak ostáva 24×24 px. */
  size?: "sm" | "md";
};

/**
 * Tlačidlo, ktoré pole otvára. Je viditeľné vždy, nie až pri prejdení myšou —
 * na dotykovom zariadení hover neexistuje a skryté tlačidlo by tam znamenalo
 * žiadne tlačidlo.
 *
 * `aria-label` nesie konkrétny deň („Pridať úlohu na piatok 7. augusta"),
 * lebo v mriežke siedmich (a v mesiaci vyše tridsiatich) rovnakých „+"
 * je samotné „Pridať" bezcenné.
 */
export function AddTaskButton({
  date,
  size = "md",
  className,
  onPointerDown,
  ...rest
}: AddTaskButtonProps) {
  const label = `Pridať úlohu na ${formatDayAccusativeSk(date)}`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        /*
          dnd-kit počúva pointer udalosti a stĺpec aj riadky sú jeho plochy.
          Bez zastavenia by stlačenie „+" mohlo naštartovať ťahanie a tlačidlo
          by sa na dotyku správalo ako rúčka, nie ako tlačidlo.
        */
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded",
        "text-fg-subtle transition-colors duration-100 ease-out",
        "hover:bg-surface-2 hover:text-fg active:bg-surface-2",
        // 24×24 px je minimum podľa WCAG 2.2 SC 2.5.8; v stĺpci týždňa je miesto na viac.
        size === "sm" ? "size-6" : "size-7",
        className,
      )}
      {...rest}
    >
      <Plus aria-hidden="true" size={size === "sm" ? 13 : 15} />
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   POLE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AddTaskInlineProps {
  /** Deň, na ktorý úloha pôjde — RRRR-MM-DD. */
  date: string;
  /** Escape alebo dokončenie — rodič pole zavrie a vráti fokus na „+". */
  onClose: () => void;
  /**
   * Beží v tej istej tranzícii ako ukladanie, takže rodič môže cez
   * `useOptimistic` vykresliť riadok skôr, než server odpovie.
   */
  onOptimisticAdd?: (title: string) => void;
  /** Vypísať názov dňa nad poľom — pre bunku mesiaca, ktorá ho v hlavičke nemá. */
  showDay?: boolean;
  className?: string;
}

export function AddTaskInline({
  date,
  onClose,
  onOptimisticAdd,
  showDay = false,
  className,
}: AddTaskInlineProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  /** Uložené na serveri, alebo len odložené do fronty? Mení text potvrdenia. */
  const [savedQueued, setSavedQueued] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Mimo `CaptureProvider` sa proste „viac" nezobrazí — komponent má fungovať
  // aj tam, kde rýchle zachytenie nie je namontované.
  const capture = useCaptureOptional();
  // Mimo `OutboxProvider` je `null` — vtedy sa ukladá po starom, priamo na server.
  const outbox = useOutbox();

  const trimmed = value.trim();
  /** Nominatív do nadpisu („piatok 7. augusta"), akuzatív za predložku „na". */
  const dayLabel = formatLongSk(date);
  const dayOnto = formatDayAccusativeSk(date);

  function save(): void {
    const title = value.trim();
    if (title === "" || isPending) return;

    // Pole sa vyprázdni HNEĎ, nie až po odpovedi — celý zmysel dávkového
    // plánovania je písať ďalej, kým sa predchádzajúca úloha ukladá.
    setValue("");
    setError(null);
    setSavedTitle(title);
    setSavedQueued(false);
    // Po uložení tlačidlom by fokus ostal na tlačidle — vrátime ho do poľa,
    // aby sa dalo písať ďalej bez siahnutia myšou.
    inputRef.current?.focus();

    /** Neúspech, ktorý sa nedá zachrániť: vrátime text aj chybu. */
    function giveUp(message: string): void {
      setSavedTitle(null);
      setError(message);
      // Text sa nesmie stratiť — vrátime ho, ak medzitým nezačal písať nový.
      setValue((current) => (current === "" ? title : current));
    }

    /**
     * Odloží úlohu do fronty. Vráti `true`, ak sa to podarilo.
     *
     * Pozor na jeden rozdiel oproti online ceste: fronta vie odovzdať iba
     * surový text a deň, takže sa na serveri prežene parserom — na rozdiel
     * od `createTask`, ktorý berie názov doslova. Napísané „kúpiť mlieko
     * v piatok" tak offline skončí ako „kúpiť mlieko" v piatok. Je to daň za
     * to, že fronta má jediný, zámerne úzky tvar; strata nápadu by bola horšia.
     */
    async function queue(): Promise<boolean> {
      if (outbox === null) return false;
      try {
        await outbox.enqueueCapture(title, date);
        setSavedQueued(true);
        return true;
      } catch {
        return false;
      }
    }

    startTransition(async () => {
      onOptimisticAdd?.(title);

      // Bez signálu server nevoláme vôbec.
      if (outbox !== null && !outbox.online) {
        if (await queue()) return;
        giveUp("Úlohu sa nepodarilo odložiť na neskôr. Skús to znova.");
        return;
      }

      try {
        const result = await createTask({
          title,
          plannedDate: date,
          status: "todo",
        });
        // `{ ok: false }` je chyba validácie — do fronty nepatrí.
        if (!result.ok) giveUp(result.error);
      } catch {
        // Výnimka je sieťová chyba — skúsime úlohu zachrániť do fronty.
        if (await queue()) return;
        giveUp("Úlohu sa nepodarilo uložiť. Skús to znova.");
      }
    });
  }

  /** „viac" — ten istý deň, ale s celým parserom a už napísaným textom. */
  function openFullCapture(): void {
    const text = value.trim();
    onClose();
    capture?.openCapture({
      defaultDate: date,
      ...(text === "" ? {} : { defaultText: text }),
    });
  }

  return (
    <div
      // `select-text` prebíja `no-drag-select` z týždennej dosky — bez toho
      // sa v poli nedá označiť ani opraviť napísaný text.
      className={cn("flex select-text flex-col gap-1", className)}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {showDay ? (
        <p className="px-0.5 text-[11px] font-medium text-fg-muted">{dayLabel}</p>
      ) : null}

      <Input
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (error !== null) setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            // Zastavené zámerne: v bunke mesiaca sedí pole v popovere a ten by
            // sa inak zavrel sám, mimo nášho `onClose`, ktorý vracia fokus.
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== "Enter") return;
          // Enter, ktorým sa potvrdzuje kandidát z IME, nie je uloženie.
          if (event.nativeEvent.isComposing) return;
          /*
            Enter obsluhujeme sami. Formulár tu zámerne žiadny nie je: v bunke
            mesiaca žije pole v portáli popovera, kde sa na implicitné odoslanie
            spoľahnúť nedá (rovnaká pasca ako v rýchlom zachytení).
          */
          event.preventDefault();
          save();
        }}
        placeholder="Nová úloha"
        aria-label={`Nová úloha na ${dayOnto}`}
        autoComplete="off"
        spellCheck={false}
        className="h-9 text-[13px]"
      />

      <div className="flex items-center justify-between gap-1">
        {capture !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openFullCapture}
            aria-label={`Otvoriť rýchle zachytenie s dňom ${dayLabel}`}
            title="Priorita, odhad, kontext, projekt — celé rýchle zachytenie"
            className="px-1.5"
          >
            viac
          </Button>
        ) : (
          <span />
        )}

        {/*
          Na dotykovom zariadení je toto jediná cesta, ako uložiť bez Enteru
          z klávesnice — preto tu je, hoci klávesnica ho nepotrebuje.
        */}
        <Button
          type="button"
          variant="primary"
          size="icon"
          onClick={save}
          disabled={trimmed === ""}
          aria-label={`Uložiť úlohu na ${dayOnto}`}
          title="Uložiť (Enter)"
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Check aria-hidden="true" className="size-4" />
          )}
        </Button>
      </div>

      {error !== null ? (
        <p role="alert" className="text-[11px] font-medium text-danger">
          {error}
        </p>
      ) : savedTitle !== null ? (
        <p
          role="status"
          className={cn(
            "truncate text-[11px]",
            savedQueued ? "text-warn" : "text-success",
          )}
        >
          {savedQueued ? "Odošle sa po pripojení: " : "Pridané: "}
          {savedTitle}
        </p>
      ) : (
        <p aria-hidden="true" className="truncate text-[10px] text-fg-subtle">
          Enter uloží, Esc zavrie
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   „+" S POĽOM V BUBLINE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AddTaskPopoverProps {
  /** Deň, na ktorý sa pridáva — RRRR-MM-DD. */
  date: string;
  size?: "sm" | "md";
  /** Zarovnanie bubliny k tlačidlu. */
  align?: "start" | "center" | "end";
  className?: string;
}

/**
 * Tlačidlo „+" aj s poľom, celé v jednom — pre miesta, kde sa pole do plochy
 * nezmestí. Typicky bunka mesiaca: pod `sm` má okolo 44 px na šírku, takže
 * textové pole v nej nemá kde byť.
 *
 * Je to zámerne samostatný, sebestačný komponent so svojím stavom: `day-cell.tsx`
 * si zo servera berie `MAX_ENTRIES_PER_DAY`, takže sám hooky obsahovať nesmie.
 * Takto ostáva serverovo importovateľný a interaktívnu časť si len vloží.
 *
 * Obsah bubliny sa vykresľuje podmienene (`open ? … : null`), a to z konkrétneho
 * dôvodu: `PopoverContent` má natrvalo triedu `.animate-in-fast`, takže po
 * zatvorení mu `animationName` ostáva nastavené. Radix z toho usúdi, že beží
 * odchodová animácia, počká na `animationend` — a ten už nikdy nepríde. Uzol
 * potom v DOM ostane visieť: neviditeľný, ale stále zaostriteľný, s fokusom
 * uväzneným v skrytom poli. Vlastné odmontovanie to rieši bez zásahu do
 * spoločného primitívu.
 *
 * Fokus po zatvorení vracia Radix na spúšťač sám (`onUnmountAutoFocus`), a pri
 * zatvorení kliknutím vedľa ho správne nevracia vôbec.
 */
export function AddTaskPopover({
  date,
  size = "sm",
  align = "end",
  className,
}: AddTaskPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <AddTaskButton
          date={date}
          size={size}
          className={cn(className, open && "bg-surface-2 text-fg")}
        />
      </PopoverTrigger>

      {open ? (
        <PopoverContent align={align} className="w-64 p-2">
          <AddTaskInline date={date} showDay onClose={() => setOpen(false)} />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
