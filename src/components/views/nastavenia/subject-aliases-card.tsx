"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveSubjectAliases } from "@/server/actions/settings";

/**
 * Prezývky predmetov — čo ešte v názve úlohy znamená daný predmet.
 *
 * „matika DU" má byť matematika, „nj slovíčka" nemčina. Bežné meno jazyka
 * („nemčina") appka pozná sama a ukazuje ho tu sivým, aby bolo vidieť, čo
 * netreba písať. Diakritika ani veľké písmená nerozhodujú a dlhšie prezývky
 * sa aj skloňujú („z matiky"). Pravidlo je v `src/lib/subject-match.ts`.
 *
 * Každý predmet sa ukladá zvlášť pri odchode z políčka — rovnako ako ostatné
 * nastavenia, bez tlačidla Uložiť.
 */
export interface SubjectAliasesRow {
  code: string;
  name: string | null;
  /** Čo appka rozpozná sama (`builtInAliases`). */
  builtIn: string[];
  aliases: string[];
}

export function SubjectAliasesCard({ subjects }: { subjects: readonly SubjectAliasesRow[] }) {
  return (
    <section>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-fg">Prezývky predmetov</h2>
          <p className="text-body leading-relaxed text-fg-muted">
            Keď v úlohe napíšeš skratku alebo názov predmetu, appka ho priradí sama. Sem dopíš, ako
            predmetom hovoríš inak — napríklad <em>matika</em> alebo <em>nj</em>. Viac prezývok oddeľ
            čiarkou.
          </p>
          <p className="text-meta leading-relaxed text-fg-subtle">
            Diakritika ani veľké písmená nerozhodujú a dlhšie prezývky sedia aj v inom páde
            („z matiky“). Krátke (do štyroch znakov) sa berú len ako samostatné slovo.
          </p>
        </div>

        {subjects.length === 0 ? (
          <p className="text-body text-fg-muted">
            Zatiaľ nemáš žiadne predmety — pribudnú, keď si na obrazovke Rozvrh načítaš rozvrh.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded border border-border">
            {subjects.map((subject) => (
              <SubjectRow key={subject.code} subject={subject} />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function SubjectRow({ subject }: { subject: SubjectAliasesRow }) {
  const [text, setText] = useState(subject.aliases.join(", "));
  const [saved, setSaved] = useState(subject.aliases.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputId = `prezyvky-${subject.code}`;

  function save(): void {
    if (text.trim() === saved.trim()) return;
    setError(null);
    setJustSaved(false);
    startTransition(async () => {
      const result = await saveSubjectAliases(subject.code, text.split(","));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const clean = result.data.join(", ");
      setText(clean);
      setSaved(clean);
      setJustSaved(true);
    });
  }

  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5">
      <label htmlFor={inputId} className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-meta font-medium text-fg">{subject.code}</span>
        {subject.name ? <span className="text-body text-fg">{subject.name}</span> : null}
        {subject.builtIn.length > 0 ? (
          <span className="text-meta text-fg-subtle">· rozpozná aj {subject.builtIn.join(", ")}</span>
        ) : null}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          value={text}
          maxLength={400}
          placeholder="prezývky oddelené čiarkou"
          onChange={(event) => {
            setText(event.target.value);
            setJustSaved(false);
          }}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
        />
        <span className="flex size-4 shrink-0 items-center justify-center" aria-live="polite">
          {isPending ? (
            <LoaderCircle aria-label="Ukladám" className="size-4 animate-spin text-fg-subtle" />
          ) : justSaved ? (
            <Check aria-label="Uložené" className="size-4 text-success" />
          ) : null}
        </span>
      </div>
      {error ? <p className="text-mini text-danger">{error}</p> : null}
    </li>
  );
}
