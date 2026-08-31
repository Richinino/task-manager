"use client";

import { useId, useState, useTransition } from "react";
import { CalendarPlus, LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDayMonthSk } from "@/lib/dates";
import { countSk } from "@/lib/sk";
import { addBreak, addPublicHolidays, deleteBreak } from "@/server/actions/school";

/* ═══════════════════════════════════════════════════════════════════════════
   PRÁZDNINY A VOĽNÁ

   Odber rozvrhu ich neobsahuje — je to rozvrh natiahnutý na dátumy, nie
   denný plán. Overené na skutočnom feede: 15. 9. aj 17. 11. 2026 sú štátne
   sviatky a feed na nich mal plných osem hodín.

   **Štátne sviatky sa dajú vypočítať, školské prázdniny nie.** Tie určuje
   ministerstvo, líšia sa podľa kraja a menia sa každý rok. Preto je tu
   tlačidlo na sviatky a formulár na zvyšok — hádať prázdniny by znamenalo
   tvrdiť niečo, čo nevieme.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface BreakItem {
  id: string;
  fromDate: string;
  toDate: string;
  label: string;
}

export interface BreaksPanelProps {
  breaks: readonly BreakItem[];
  /** Rok, ktorým sa začína prebiehajúci školský rok. */
  schoolYear: number;
}

export function BreaksPanel({ breaks, schoolYear }: BreaksPanelProps) {
  const [od, setOd] = useState("");
  const [doDna, setDoDna] = useState("");
  const [nazov, setNazov] = useState("");
  const [sprava, setSprava] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ids = useId();
  const idOd = `${ids}-od`;
  const idDo = `${ids}-do`;
  const idNazov = `${ids}-nazov`;

  function pridaj(): void {
    if (isPending) return;
    setError(null);
    setSprava(null);

    startTransition(async () => {
      const result = await addBreak({
        fromDate: od,
        /* Jednodňové voľno je rozsah so zhodnými koncami — nech to netreba písať dvakrát. */
        toDate: doDna === "" ? od : doDna,
        label: nazov,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setOd("");
      setDoDna("");
      setNazov("");
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
      <div className="max-w-prose">
        <h2 className="text-row font-semibold text-fg">Prázdniny a voľná</h2>
        <p className="mt-1 text-pretty text-body leading-normal text-fg-muted">
          V odbere z EduPage nie sú — na Sedembolestnú má feed plných osem
          hodín. Bez nich by ti appka dala termín na deň, keď škola nie je.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await addPublicHolidays(schoolYear);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setSprava(
                result.data.added === 0
                  ? "Všetky štátne sviatky už máš."
                  : `Pridaných ${result.data.added}` +
                      (result.data.skipped > 0
                        ? `, ${result.data.skipped} už bolo pokrytých.`
                        : "."),
              );
            })
          }
        >
          {isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <CalendarPlus className="size-4" />
          )}
          Doplniť štátne sviatky {schoolYear}/{schoolYear + 1}
        </Button>

        <span className="text-mini text-fg-muted">
          Školské prázdniny určuje ministerstvo — tie zadaj sám.
        </span>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          pridaj();
        }}
        className="flex flex-wrap items-end gap-2 rounded border border-border bg-surface-2/40 p-3"
      >
        <label htmlFor={idOd} className="flex flex-col gap-1">
          <span className="label text-fg-subtle">Od</span>
          <Input
            id={idOd}
            type="date"
            value={od}
            onChange={(event) => setOd(event.target.value)}
            className="w-40"
          />
        </label>

        <label htmlFor={idDo} className="flex flex-col gap-1">
          <span className="label text-fg-subtle">Do (nepovinné)</span>
          <Input
            id={idDo}
            type="date"
            value={doDna}
            onChange={(event) => setDoDna(event.target.value)}
            className="w-40"
          />
        </label>

        <label htmlFor={idNazov} className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <span className="label text-fg-subtle">Názov</span>
          <Input
            id={idNazov}
            value={nazov}
            onChange={(event) => setNazov(event.target.value)}
            maxLength={120}
            placeholder="Jesenné prázdniny, riaditeľské voľno…"
          />
        </label>

        <Button
          type="submit"
          variant="primary"
          disabled={isPending || od === "" || nazov.trim() === ""}
        >
          Pridať
        </Button>
      </form>

      {sprava ? <p className="text-mini text-fg-muted">{sprava}</p> : null}
      {error ? <p className="text-mini text-danger">{error}</p> : null}

      {breaks.length === 0 ? (
        <p className="text-mini text-fg-muted">Zatiaľ žiadne voľno.</p>
      ) : (
        <>
          <h3 className="label text-fg-subtle">
            {countSk(breaks.length, "voľno", "voľná", "voľien")}
          </h3>
          <ul className="flex flex-col">
            {breaks.map((volno) => (
              <li
                key={volno.id}
                className="group flex min-w-0 items-center gap-2 border-b border-border/60 py-1.5 last:border-b-0"
              >
                <span className="w-32 shrink-0 font-mono text-mini tabular-nums text-fg-muted">
                  {formatDayMonthSk(volno.fromDate)}
                  {volno.toDate !== volno.fromDate
                    ? `–${formatDayMonthSk(volno.toDate)}`
                    : ""}
                </span>

                <span className="min-w-0 flex-1 truncate text-body text-fg">
                  {volno.label}
                </span>

                <button
                  type="button"
                  aria-label={`Zmazať voľno ${volno.label}`}
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteBreak(volno.id);
                      if (!result.ok) setError(result.error);
                    })
                  }
                  className="shrink-0 text-fg-subtle opacity-0 transition-opacity duration-100 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
