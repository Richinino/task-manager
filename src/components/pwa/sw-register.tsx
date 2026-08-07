"use client";

import { useEffect } from "react";

/**
 * Zaregistruje service worker `/sw.js`. Nič nevykresľuje.
 *
 * Registrujeme až po `load`, aby sa sťahovanie service workera nebilo o pásmo
 * s prvým vykreslením. Iba v produkcii — vo vývoji by cache znemožnila hot
 * reload. Ak prehliadač service workery nepozná (staršie Safari, súkromné
 * okno), ticho nerobíme nič a appka beží ďalej, len bez offline režimu.
 */
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    /**
     * Novú verziu prevezmeme ticho: keď je nainštalovaná a stránku riadi ešte
     * stará, požiadame ju, nech sa pustí. Stránku nikdy sami neobnovujeme —
     * používateľ môže mať rozpísanú úlohu. Nová verzia sa prejaví pri ďalšej
     * navigácii.
     */
    function activateSilently(worker: ServiceWorker): void {
      if (worker.state !== "installed") return;
      if (!navigator.serviceWorker.controller) return;
      worker.postMessage({ type: "SKIP_WAITING" });
    }

    function register(): void {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          if (cancelled) return;

          if (registration.waiting) activateSilently(registration.waiting);

          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              activateSilently(installing);
            });
          });
        })
        .catch(() => {
          // Registrácia môže zlyhať (HTTP bez TLS, zakázané úložisko).
          // Offline režim odpadne, nič viac.
        });
    }

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
