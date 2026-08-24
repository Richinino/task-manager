"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { removePushSubscription, savePushSubscription } from "@/server/actions/push";

/**
 * Prihlásenie tohto prehliadača na pripomienky.
 *
 * Notifikácia môže prísť, len keď o ňu človek **sám požiada** — prehliadač
 * povolenie inak nedá. Preto je to tlačidlo v nastaveniach a nie niečo, čo
 * sa spýta samo pri prvom otvorení: vyskakovacie okno bez kontextu ľudia
 * odmietnu a späť sa to už nedá vypýtať.
 *
 * **Platí pre jeden prehliadač, nie pre človeka.** Telefón a notebook sa
 * prihlasujú zvlášť; každý má vlastný `endpoint` a vlastný riadok.
 *
 * Bez kľúčov VAPID sa komponent nevykreslí vôbec — ponúkať tlačidlo, ktoré
 * vždy zlyhá, je horšie než ho nemať.
 */
export interface PushSetupProps {
  /** Verejný kľúč VAPID zo servera. */
  publicKey: string;
}

type Stav =
  | "zistujem"
  | "nepodporovane"
  | "zakazane"
  | "prihlasene"
  | "neprihlasene";

/**
 * base64url → `Uint8Array`, ako to chce `applicationServerKey`.
 *
 * `atob` pozná len klasický base64, takže sa najprv vrátia `+` a `/`
 * a doplní sa zarovnanie.
 */
function kluc(base64url: string): Uint8Array<ArrayBuffer> {
  const doplnok = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + doplnok).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);

  /*
    Pole sa stavia nad výslovným `ArrayBuffer`. Holé `new Uint8Array(n)` má
    v TypeScripte 6 typ `Uint8Array<ArrayBufferLike>`, a ten `applicationServerKey`
    neberie — pripúšťa aj `SharedArrayBuffer`, ktorý sa cez hranicu vlákna
    poslať nedá.
  */
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushSetup({ publicKey }: PushSetupProps) {
  const [stav, setStav] = useState<Stav>("zistujem");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /* Čo vie tento prehliadač a či už prihlásený je. */
  useEffect(() => {
    let zruseny = false;

    void (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!zruseny) setStav("nepodporovane");
        return;
      }

      if (Notification.permission === "denied") {
        if (!zruseny) setStav("zakazane");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!zruseny) setStav(existing ? "prihlasene" : "neprihlasene");
      } catch {
        if (!zruseny) setStav("neprihlasene");
      }
    })();

    return () => {
      zruseny = true;
    };
  }, []);

  function prihlas(): void {
    setError(null);
    startTransition(async () => {
      try {
        const povolenie = await Notification.requestPermission();
        if (povolenie !== "granted") {
          setStav(povolenie === "denied" ? "zakazane" : "neprihlasene");
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          /*
            `true` je povinné: sľubujeme, že po každej správe zobrazíme
            notifikáciu. Prehliadač to kontroluje a pri tichých správach
            povolenie odoberie.
          */
          userVisibleOnly: true,
          applicationServerKey: kluc(publicKey),
        });

        const result = await savePushSubscription(
          subscription.toJSON(),
          navigator.userAgent,
        );
        if (!result.ok) {
          // Server ho neprijal — nenechávame prehliadač prihlásený naprázdno.
          await subscription.unsubscribe();
          setError(result.error);
          setStav("neprihlasene");
          return;
        }

        setStav("prihlasene");
      } catch {
        setError("Prihlásenie na notifikácie sa nepodarilo. Skús to znova.");
        setStav("neprihlasene");
      }
    });
  }

  function odhlas(): void {
    setError(null);
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const { endpoint } = subscription;
          await subscription.unsubscribe();
          await removePushSubscription(endpoint);
        }
        setStav("neprihlasene");
      } catch {
        setError("Odhlásenie sa nepodarilo. Skús to znova.");
      }
    });
  }

  if (stav === "zistujem") return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {stav === "prihlasene" ? (
          <>
            <span className="flex items-center gap-1.5 text-body font-medium text-success">
              <BellRing aria-hidden="true" size={14} className="shrink-0" />
              Tento prehliadač pripomienky dostáva
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={odhlas}
            >
              Odhlásiť
            </Button>
          </>
        ) : stav === "neprihlasene" ? (
          <Button type="button" variant="secondary" disabled={isPending} onClick={prihlas}>
            <BellRing aria-hidden="true" size={14} />
            Zapnúť pripomienky v tomto prehliadači
          </Button>
        ) : (
          <span className="flex items-center gap-1.5 text-body text-fg-muted">
            <BellOff aria-hidden="true" size={14} className="shrink-0" />
            {stav === "zakazane"
              ? "Notifikácie sú v tomto prehliadači zakázané."
              : "Tento prehliadač notifikácie nepodporuje."}
          </span>
        )}
      </div>

      {/*
        Zakázané povolenie sa z appky vrátiť NEDÁ — prehliadač sa druhýkrát
        nespýta. Bez tejto vety by človek klikal na tlačidlo, ktoré by mlčalo.
      */}
      {stav === "zakazane" ? (
        <p className="text-meta leading-relaxed text-fg-muted">
          Appka o povolenie druhýkrát požiadať nemôže. Povoľ ho v nastaveniach
          stránky v prehliadači (ikona vedľa adresy) a vráť sa sem.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className={cn("text-meta text-danger")}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
