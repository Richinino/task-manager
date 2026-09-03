"use client";

import { useId, useState, useTransition } from "react";
import { LoaderCircle, Split } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addDays } from "@/lib/dates";
import { splitTask } from "@/server/actions/tasks";

/* ═══════════════════════════════════════════════════════════════════════════
   ROZDELENIE ÚLOHY

   Úloha, ktorú si začal a nestihol, sa na druhý deň hlási ako nespravená.
   Nie je to pravda: spravená bola, len nie celá.

   Rozdelenie z toho vyrobí **hotový záznam o odvedenej práci** a pôvodnú
   úlohu nechá bežať so zvyškom. Deň potom ukáže o jednu hotovú vec viac —
   a to je celý zmysel. Zmäkčiť farbu nestačilo: práca sa má zarátať.

   Otázka je jedna jediná a znie „čo si spravil", nie „na koľko percent si
   to spravil". Percentá si nikto neodhadne poctivo a nedá sa z nich nič
   vyčítať; veta „úvod a osnova" povie o týždeň presne to, čo sa stalo.

   Názov hotového záznamu ostáva PÔVODNÝ a spravená časť ide pod neho malým.
   Premenovať úlohu na to, čo z nej vzniklo, by znamenalo, že ju človek
   o týždeň v zozname nenájde — hľadá ju pod menom, ktoré jej dal sám.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SplitTaskDialogProps {
  taskId: string | null;
  /** Názov pôvodnej úlohy — do vysvetľujúcej vety. */
  taskTitle: string;
  /** Dnešok v pásme používateľa. Klient si ho nikdy nepočíta sám. */
  todayIso: string;
  onClose: () => void;
  /** Zavolá sa po úspechu — obrazovka si môže dotiahnuť dáta. */
  onDone?: () => void;
}

export function SplitTaskDialog({
  taskId,
  taskTitle,
  todayIso,
  onClose,
  onDone,
}: SplitTaskDialogProps) {
  /*
    Rozpísaný text si nesie, KTOREJ úlohy sa týka. Nulovať ho v efekte by bol
    `setState` počas vykresľovania; takto sa pri inej úlohe proste nezhodne
    a pole je prázdne. Bez toho by v ňom svietil text z minulej úlohy
    a stačilo by raz nepozrieť, aby sa uložil k nesprávnej.
  */
  const [rozpisane, setRozpisane] = useState<{ id: string; text: string } | null>(null);
  const doneTitle = rozpisane !== null && rozpisane.id === taskId ? rozpisane.text : "";
  const setDoneTitle = (text: string): void => {
    if (taskId !== null) setRozpisane({ id: taskId, text });
  };

  const [zajtraPre, setZajtraPre] = useState<string | null>(null);
  const pokracujeZajtra = zajtraPre !== taskId;

  const [chybaPre, setChybaPre] = useState<{ id: string; text: string } | null>(null);
  const error = chybaPre !== null && chybaPre.id === taskId ? chybaPre.text : null;
  const setError = (text: string | null): void => {
    setChybaPre(text === null || taskId === null ? null : { id: taskId, text });
  };

  const [isPending, startTransition] = useTransition();
  const poleId = useId();

  function uloz(): void {
    if (taskId === null || isPending) return;
    const text = doneTitle.trim();
    if (text === "") {
      setError("Napíš, čo z toho je hotové.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await splitTask(taskId, {
        doneTitle: text,
        ...(pokracujeZajtra ? { remainderDate: addDays(todayIso, 1) } : {}),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onClose();
      onDone?.();
    });
  }

  return (
    <Dialog open={taskId !== null} onOpenChange={(open) => !open && onClose()}>
      {taskId !== null ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rozdeliť úlohu</DialogTitle>
            <DialogDescription>
              Vznikne hotový záznam s tým istým názvom „{taskTitle}“ a pod ním
              malým to, čo si spravil. Zvyšok pokračuje ďalej.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={poleId} className="label text-fg-subtle">
                Čo z toho je hotové
              </label>
              <Input
                id={poleId}
                value={doneTitle}
                onChange={(event) => setDoneTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    uloz();
                  }
                }}
                maxLength={500}
                placeholder="Napríklad: úvod a osnova"
              />
            </div>

            {/*
              Predvolene zajtra: rozdelenie sa robí večer, keď deň nevyšiel,
              a nechať zvyšok visieť na dnešku by ho ráno hodilo medzi
              prepadnuté — presne to, čomu sa tým chce predísť.
            */}
            <label className="flex min-h-11 items-center gap-2 sm:min-h-9">
              <input
                type="checkbox"
                checked={pokracujeZajtra}
                onChange={(event) =>
                  setZajtraPre(event.target.checked ? null : taskId)
                }
                className="size-4 accent-[var(--accent)]"
              />
              <span className="text-body text-fg">Vo zvyšku pokračujem zajtra</span>
            </label>

            {error ? <p className="text-mini text-danger">{error}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={isPending} onClick={uloz}>
                {isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Split className="size-4" />
                )}
                Rozdeliť
              </Button>
              <Button disabled={isPending} onClick={onClose}>
                Zrušiť
              </Button>
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
