"use client";

import { CloudOff, RotateCw } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Stránka pre stav bez signálu. Vracia ju service worker vtedy, keď sieť
 * zlyhá a danú adresu nemá ani v cache.
 *
 * Nesmie sa tu diať nič serverové — žiadny `requireUser()`, žiadny dotaz do
 * databázy. Inak by stránka pre stav bez signálu sama padla presne vo chvíli,
 * keď je potrebná. Preto je to čisto klientský komponent bez dát: Next ju
 * predgeneruje pri builde a service worker si ju odloží pri inštalácii.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[22rem]">
        <div className="rounded border border-border bg-surface p-5">
          <div className="mb-4 flex size-9 items-center justify-center rounded bg-surface-2">
            <CloudOff className="size-[18px] text-fg-muted" aria-hidden="true" />
          </div>

          <h1 className="text-base font-semibold tracking-tight text-fg">
            Zariadenie je bez pripojenia
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
            Túto obrazovku sa nepodarilo načítať zo servera. Appka to skúsi sama,
            len čo bude signál — nemusíš nič strážiť.
          </p>

          <p className="mt-3 rounded bg-accent-soft px-3 py-2.5 text-[13px] leading-relaxed text-fg">
            Novú úlohu môžeš zachytiť aj teraz. Uloží sa priamo v telefóne a
            odošle sa sama, keď sa pripojenie vráti.
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => {
                window.location.reload();
              }}
            >
              <RotateCw className="size-4" aria-hidden="true" />
              Skúsiť znova
            </Button>

            <Link
              href="/dnes"
              className="rounded px-3 py-1.5 text-center text-[13px] text-fg-muted transition-colors duration-100 hover:text-fg"
            >
              Späť na dnešný deň
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center text-[12px] leading-relaxed text-fg-subtle">
          Naposledy načítané obrazovky fungujú aj bez signálu. Úpravy a mazanie
          počkajú na pripojenie.
        </p>
      </div>
    </main>
  );
}
