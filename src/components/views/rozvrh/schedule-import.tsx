"use client";

import { useRef, useState, useTransition } from "react";
import { LoaderCircle, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { countSk } from "@/lib/sk";
import { importSchedule, readGroups } from "@/server/actions/school";
import { updateSettings } from "@/server/actions/settings";

/* ═══════════════════════════════════════════════════════════════════════════
   NAČÍTANIE ROZVRHU

   Súbor sa načíta v prehliadači a na server ide už ako text. Nahrávanie
   súborov by znamenalo ďalšiu cestu, ktorú treba strážiť — a je to jeden
   textový súbor, nie príloha.

   Poradie krokov je dôležité: **najprv sa vyberú skupiny, až potom sa
   importuje.** Odber je celej triedy a bez výberu by v rozvrhu boli dvojité
   okienka a rozpočet dňa dvakrát zožratý.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ScheduleImportProps {
  /** Skupiny, ktoré má už uložené v nastaveniach. */
  chosen: readonly string[];
}

export function ScheduleImport({ chosen }: ScheduleImportProps) {
  const [ics, setIcs] = useState<string | null>(null);
  const [delene, setDelene] = useState<string[]>([]);
  const [vyber, setVyber] = useState<string[]>([...chosen]);
  const [sprava, setSprava] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function nacitajSubor(subor: File): void {
    setError(null);
    setSprava(null);

    startTransition(async () => {
      const text = await subor.text();
      const result = await readGroups(text);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setIcs(text);
      setDelene(result.data.delene);

      if (result.data.delene.length === 0) {
        setSprava("Rozvrh sa nikde nedelí — netreba nič vyberať.");
      }
    });
  }

  function importuj(): void {
    if (ics === null || isPending) return;
    setError(null);

    startTransition(async () => {
      const ulozene = await updateSettings({ schoolGroups: vyber });
      if (!ulozene.ok) {
        setError(ulozene.error);
        return;
      }

      const result = await importSchedule(ics);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const d = result.data;
      setSprava(
        `Z ${d.voFeede} hodín triedy je tvojich ${d.mojich}. ` +
          `Pridaných ${d.pridanych}, upravených ${d.upravenych}, ` +
          `zmazaných ${d.zmazanych}` +
          (d.ponechanych > 0 ? `, ponechaných ${d.ponechanych} ručných` : "") +
          `. Nových predmetov ${d.novychPredmetov}, vyučujúcich ${d.novychUcitelov}.`,
      );
      setIcs(null);
      if (inputRef.current !== null) inputRef.current.value = "";
    });
  }

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="max-w-prose">
        <h2 className="text-row font-semibold text-fg">Načítať rozvrh</h2>
        <p className="mt-1 text-pretty text-body leading-normal text-fg-muted">
          Súbor <code className="font-mono text-mini">.ics</code> z EduPage —
          Nastavenia → Ostatné → Môj profil → iCalendar. Suplovanie ani prázdniny
          v ňom nie sú, tie sa zadávajú tu.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".ics,text/calendar"
          aria-label="Súbor s rozvrhom"
          onChange={(event) => {
            const subor = event.target.files?.[0];
            if (subor !== undefined) nacitajSubor(subor);
          }}
          className="max-w-full text-mini text-fg-muted file:mr-2 file:rounded file:border file:border-border file:bg-surface file:px-2 file:py-1 file:text-mini file:text-fg"
        />
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-fg-subtle" />
        ) : null}
      </div>

      {delene.length > 0 ? (
        <div className="flex flex-col gap-2 rounded border border-border bg-surface-2/40 p-3">
          <div>
            <h3 className="label text-fg-subtle">Ktoré skupiny sú tvoje</h3>
            <p className="mt-1 text-mini text-fg-muted">
              Rozvrh je celej triedy. Toto sú jediné miesta, kde sa delí —
              {" "}
              {countSk(delene.length, "možnosť", "možnosti", "možností")}. Ostatné
              hodiny má celá trieda a berú sa samy.
            </p>
          </div>

          <ul className="flex flex-col gap-1">
            {delene.map((skupina) => (
              <li key={skupina}>
                <label className="flex min-h-11 items-center gap-2 sm:min-h-8">
                  <Checkbox
                    checked={vyber.includes(skupina)}
                    onCheckedChange={(value) =>
                      setVyber((staré) =>
                        value === true
                          ? [...staré, skupina]
                          : staré.filter((s) => s !== skupina),
                      )
                    }
                  />
                  <span className="text-body text-fg">{skupina}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ics !== null ? (
        <Button
          variant="primary"
          className="self-start"
          disabled={isPending}
          onClick={importuj}
        >
          {isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          Načítať rozvrh
        </Button>
      ) : null}

      {sprava ? <p className="text-mini text-fg-muted">{sprava}</p> : null}
      {error ? <p className="text-mini text-danger">{error}</p> : null}
    </div>
  );
}
