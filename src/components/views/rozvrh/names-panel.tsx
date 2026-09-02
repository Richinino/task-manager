"use client";

import { useState, useTransition } from "react";

import { areaColorValue } from "@/components/task/area-dot";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { importNames, setSubjectName, setTeacherName } from "@/server/actions/school";

/* ═══════════════════════════════════════════════════════════════════════════
   CELÉ NÁZVY

   Zdroj dodáva len skratky — `ANJ`, `LIN`. Celé názvy v ňom nie sú vôbec,
   takže sa doplnia raz a **ďalší import sa ich nedotkne**: import píše len
   to, čo z odberu naozaj prišlo.

   Skratky sú v mriežke aj tak lepšie (celý názov sa do okienka nezmestí);
   celé meno má zmysel v detaile hodiny, kde je naň miesto.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Ukážka tvaru v prázdnom poli. Dva riadky — predmet a vyučujúci. */
const PRIKLAD = ["ANJ;Anglický jazyk", "LIN;Agáta Lintnerová"].join("\n");

export interface NameItem {
  id: string;
  code: string;
  name: string | null;
  /** Len predmety — do bodky vedľa skratky. */
  color?: string;
}

export interface NamesPanelProps {
  subjects: readonly NameItem[];
  teachers: readonly NameItem[];
}

export function NamesPanel({ subjects, teachers }: NamesPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [vlozene, setVlozene] = useState("");
  const [sprava, setSprava] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function vloz(): void {
    if (isPending || vlozene.trim() === "") return;
    setError(null);
    setSprava(null);

    startTransition(async () => {
      const result = await importNames(vlozene);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const d = result.data;
      const casti: string[] = [];
      if (d.predmetov > 0) casti.push(`predmetov ${d.predmetov}`);
      if (d.ucitelov > 0) casti.push(`vyučujúcich ${d.ucitelov}`);

      /*
        Neznáme skratky sa vypisujú, nie zamlčia. Vložiť pätnásť riadkov
        a dostať „doplnené 12" bez toho, ktoré tri vypadli, znamená hľadať
        rozdiel očami.
      */
      const zvysok =
        d.nezname.length > 0 ? ` Nepoznám: ${d.nezname.join(", ")}.` : "";

      setSprava(
        casti.length === 0
          ? `Nedoplnilo sa nič.${zvysok}`
          : `Doplnené — ${casti.join(", ")}.${zvysok}`,
      );
      if (casti.length > 0) setVlozene("");
    });
  }

  if (subjects.length === 0 && teachers.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
      <div className="max-w-prose">
        <h2 className="text-row font-semibold text-fg">Celé názvy</h2>
        <p className="mt-1 text-pretty text-body leading-normal text-fg-muted">
          Rozvrh dodáva len skratky. Doplň ich raz — v mriežke ostanú skratky,
          ale v detaile hodiny uvidíš celé meno. Ďalší import ich neprepíše.
        </p>
      </div>

      {/*
        Hromadné vloženie. Tridsať políčok po jednom je tridsať krokov a človek
        má tie mená spravidla už napísané v tabuľke — vloženie je jedno
        `Ctrl+V`. Políčka pod tým ostávajú na opravu jedného preklepu.
      */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="vlozit-mena"
          className="label text-fg-subtle"
        >
          Vložiť naraz
        </label>
        <textarea
          id="vlozit-mena"
          value={vlozene}
          onChange={(event) => setVlozene(event.target.value)}
          rows={3}
          spellCheck={false}
          placeholder={PRIKLAD}
          className="w-full rounded border border-border bg-surface px-2 py-1.5 font-mono text-mini text-fg placeholder:text-fg-subtle focus:border-border-strong focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            disabled={isPending || vlozene.trim() === ""}
            onClick={vloz}
          >
            Doplniť mená
          </Button>
          <span className="text-mini text-fg-muted">
            Jeden riadok = skratka, bodkočiarka, celé meno. Predmety aj
            vyučujúcich naraz.
          </span>
        </div>
        {sprava ? <p className="text-mini text-fg-muted">{sprava}</p> : null}
      </div>

      {error ? <p className="text-mini text-danger">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Skupina
          nadpis="Predmety"
          polozky={subjects}
          onSave={setSubjectName}
          onError={setError}
          placeholder="Napríklad: Matematika"
        />
        <Skupina
          nadpis="Vyučujúci"
          polozky={teachers}
          onSave={setTeacherName}
          onError={setError}
          placeholder="Napríklad: Monika Reiterová"
        />
      </div>
    </div>
  );
}

function Skupina({
  nadpis,
  polozky,
  onSave,
  onError,
  placeholder,
}: {
  nadpis: string;
  polozky: readonly NameItem[];
  onSave: (id: string, name: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onError: (message: string) => void;
  placeholder: string;
}) {
  if (polozky.length === 0) return null;

  return (
    <section className="flex flex-col gap-1">
      <h3 className="label text-fg-subtle">{nadpis}</h3>
      <ul className="flex flex-col">
        {polozky.map((item) => (
          <li key={item.id} className="flex min-w-0 items-center gap-2 py-1">
            {item.color !== undefined ? (
              <span
                aria-hidden="true"
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: areaColorValue(item.color) }}
              />
            ) : null}

            <span className="w-16 shrink-0 truncate font-mono text-mini text-fg-muted">
              {item.code}
            </span>

            <MenoPole
              code={item.code}
              value={item.name ?? ""}
              placeholder={placeholder}
              onSave={(text) => onSave(item.id, text)}
              onError={onError}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ukladá sa opustením poľa alebo Enterom; Escape vráti pôvodné znenie. */
function MenoPole({
  code,
  value,
  placeholder,
  onSave,
  onError,
}: {
  code: string;
  value: string;
  placeholder: string;
  onSave: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [, startTransition] = useTransition();

  function save(): void {
    if (draft.trim() === value.trim()) return;
    startTransition(async () => {
      const result = await onSave(draft);
      if (!result.ok) {
        setDraft(value);
        onError(result.error);
      }
    });
  }

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      maxLength={120}
      aria-label={`Celý názov pre ${code}`}
      placeholder={placeholder}
      className="h-9 min-w-0 flex-1 text-mini"
    />
  );
}
