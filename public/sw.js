/**
 * Service worker task manažéra — ručne písaný, bez knižnice.
 *
 * Zmysel: appka sa má dať otvoriť aj bez signálu a nová úloha sa má dať
 * zapísať kedykoľvek. Preto odkladáme len to, čo na to naozaj treba:
 *
 *   • /_next/static/**, ikony a manifest → cache-first (nemenné súbory),
 *   • navigácie (celé HTML stránok)      → network-first s odkladom do cache,
 *   • všetko ostatné                     → čistá sieť, nič neodkladáme.
 *
 * BEZPEČNOSŤ. V cache navigácií leží HTML s úlohami používateľa, čiže súkromné
 * dáta. Držíme ich preto na krátkom vodítku:
 *   • navigácia na /prihlasenie znamená, že relácia už neplatí (buď sa
 *     používateľ odhlásil, alebo ho tam server presmeroval) → celú cache
 *     stránok okamžite zahodíme,
 *   • odpoveď s presmerovaním pri navigácii → záznam pre danú adresu zmažeme
 *     (prehliadač nám pri navigácii ukáže presmerovanie ako „opaqueredirect",
 *     cieľ z nej prečítať nevieme, tak mažeme pri každom presmerovaní — je to
 *     prísnejšie, než žiada zadanie, a teda bezpečné),
 *   • pri `activate` mažeme všetky staršie verzie cache,
 *   • správa { type: "CLEAR_CACHE" } vyprázdni všetko (volá sa po odhlásení).
 *
 * Cache má verzované meno. Pri zmene stratégie zvýš VERSION — stará cache sa
 * pri najbližšej aktivácii sama zmaže.
 */

// Zvýšením verzie sa pri aktivácii zahodia všetky staršie cache.
// v2: vypnutý navigation preload, ktorý zdvojoval prihlasovací callback.
const VERSION = "tm-v2";
const STATIC_CACHE = VERSION + "-static";
const PAGES_CACHE = VERSION + "-pages";
const OWN_CACHES = [STATIC_CACHE, PAGES_CACHE];

const OFFLINE_URL = "/offline";
const LOGIN_PATH = "/prihlasenie";

/** Koľko naposledy navštívených stránok si necháme. Držíme cache malú. */
const MAX_PAGES = 40;

/**
 * Posledná záchrana, keď nie je v cache ani stránka /offline. Farby sú
 * prepísané hodnoty tokenov z globals.css — sem sa Tailwind nedostane.
 */
const FALLBACK_HTML = [
  '<!doctype html><html lang="sk"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  "<title>Bez pripojenia</title><style>",
  ":root{--bg:oklch(0.985 0.003 100);--surface:oklch(1 0 0);",
  "--border:oklch(0.905 0.005 100);--fg:oklch(0.22 0.008 280);",
  "--fg-muted:oklch(0.52 0.012 280)}",
  "@media (prefers-color-scheme:dark){:root{--bg:oklch(0.168 0.008 275);",
  "--surface:oklch(0.208 0.010 275);--border:oklch(0.285 0.013 275);",
  "--fg:oklch(0.952 0.004 280);--fg-muted:oklch(0.665 0.014 280)}}",
  "body{margin:0;min-height:100dvh;display:flex;align-items:center;",
  "justify-content:center;padding:2rem;background:var(--bg);color:var(--fg);",
  'font-family:"Segoe UI",system-ui,-apple-system,sans-serif}',
  "div{max-width:22rem;border:1px solid var(--border);border-radius:.5rem;",
  "background:var(--surface);padding:1.25rem}",
  "h1{margin:0 0 .5rem;font-size:1rem}",
  "p{margin:0;font-size:.8125rem;line-height:1.6;color:var(--fg-muted)}",
  "</style></head><body><div>",
  "<h1>Zariadenie je bez pripojenia</h1>",
  "<p>Appka sa nevie spojiť so serverom. Skús to znova, len čo budeš mať signál.</p>",
  "</div></body></html>",
].join("");

/* ═══════════════════════════════════════════════════════════════════════════
   ŽIVOTNÝ CYKLUS
   ═══════════════════════════════════════════════════════════════════════════ */

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await cacheOfflinePage();
      // Nová verzia sa má prejaviť hneď, nie až po zavretí všetkých kariet.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await deleteForeignCaches();

      /*
        NAVIGATION PRELOAD JE ZÁMERNE VYPNUTÝ — nezapínaj ho späť.

        Keď je zapnutý, prehliadač odošle požiadavku hneď, ako sa service worker
        prebúdza. Ak potom obsluha `fetch` na tú navigáciu NEODPOVIE cez
        `respondWith` — a my na `/api/**` zámerne neodpovedáme — prehliadač
        predbežnú odpoveď zahodí a pošle požiadavku ZNOVA. Server ju teda
        dostane dvakrát.

        Pri `/api/auth/callback/google` to appku rozbije: autorizačný kód od
        Googla platí na jedno použitie, takže druhá požiadavka skončí na
        `invalid_grant` a používateľ vidí chybovú stránku napriek tomu, že
        prvé prihlásenie prešlo. Prejavovalo sa to len na telefóne, kde bol
        service worker aktívny z predošlej návštevy.

        Ušetrený čas pri štarte za to nestojí. Ak by sa preload niekedy vracal,
        musela by obsluha `fetch` odpovedať na ÚPLNE KAŽDÚ navigáciu a preload
        response vždy spotrebovať.
      */
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.disable();
        } catch (error) {
          // Prehliadač to nepodporuje — potom sa preload ani nezapol.
        }
      }

      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "CLEAR_CACHE") {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
        // Stránku pre stav bez signálu si vezmeme späť, nech offline režim
        // funguje aj hneď po odhlásení.
        await cacheOfflinePage();
        replyTo(event, { type: "CACHE_CLEARED" });
      })(),
    );
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   POŽIADAVKY
   ═══════════════════════════════════════════════════════════════════════════ */

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Zápisy (server actions, Auth.js, čokoľvek iné) idú vždy priamo na sieť.
  if (request.method !== "GET") return;
  if (request.headers.has("Next-Action")) return;
  if (request.headers.has("Range")) return;

  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  // Cudzie domény ani rozšírenia prehliadača nás nezaujímajú.
  if (url.origin !== self.location.origin) return;

  // /api/** vrátane /api/auth/** — nikdy necachovať.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event, url));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Všetko ostatné (RSC dotazy, /_next/image, …) necháme tiecť na sieť.
});

/**
 * Nemenné súbory: cache-first. Súbory v /_next/static/ majú v názve hash,
 * takže sa nikdy nezmenia pod rukami.
 */
function isStaticAsset(url) {
  const path = url.pathname;
  if (path.startsWith("/_next/static/")) return true;
  if (path === "/manifest.webmanifest" || path === "/manifest.json") return true;
  // Ikony generované Next.js cez ImageResponse žijú na cestách bez prípony
  // (`/icon`, `/apple-icon`), preto ich treba vymenovať zvlášť.
  if (path === "/icon" || path.startsWith("/icon/")) return true;
  if (path === "/apple-icon" || path.startsWith("/apple-icon/")) return true;
  return /\.(?:png|jpg|jpeg|svg|webp|avif|ico|woff2?|ttf)$/i.test(path);
}

async function cacheFirst(request) {
  let cache = null;
  try {
    cache = await caches.open(STATIC_CACHE);
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
  } catch (error) {
    // Súkromné okno bez úložiska. Skúsime aspoň sieť.
  }

  try {
    const response = await fetch(request);
    if (cache && response.status === 200 && response.type === "basic") {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    if (cache) {
      const stale = await cache.match(request, { ignoreVary: true });
      if (stale) return stale;
    }
    return Response.error();
  }
}

/**
 * Navigácie: najprv sieť, odpoveď odložíme, a keď sieť zlyhá, vrátime
 * poslednú známu podobu stránky. Ak ani tú nemáme, ide stránka /offline.
 */
async function handleNavigation(event, url) {
  const request = event.request;
  const key = pageKey(url);

  try {
    // Jediná požiadavka na sieť. Preload je vypnutý (viď `activate`) — druhá
    // požiadavka na to isté by pri prihlasovacom callbacku spálila autorizačný kód.
    const response = await fetch(request);

    if (url.pathname === LOGIN_PATH) {
      // Sme na prihlásení — relácia neplatí. Cudzie HTML v cache nemá čo robiť.
      event.waitUntil(caches.delete(PAGES_CACHE));
      return response;
    }

    if (isRedirect(response)) {
      // Presmerovanie (typicky práve na /prihlasenie). Starý obsah zahadzujeme.
      event.waitUntil(deletePage(key));
      return response;
    }

    if (response.status === 200 && response.type === "basic") {
      event.waitUntil(putPage(key, response.clone()));
    }
    return response;
  } catch (error) {
    const cached = await matchPage(key);
    if (cached) return cached;

    const offline = await matchOfflinePage();
    if (offline) return offline;

    return new Response(FALLBACK_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

/**
 * Pri navigácii dostaneme presmerovanie ako „opaqueredirect" — cieľ z neho
 * prečítať nevieme, preto ho berieme ako podozrivé vždy.
 */
function isRedirect(response) {
  if (response.type === "opaqueredirect") return true;
  if (response.redirected) return true;
  return response.status >= 300 && response.status < 400;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CACHE STRÁNOK
   ═══════════════════════════════════════════════════════════════════════════ */

/** Kotva bez významu pre server, aby sa tá istá stránka neuložila dvakrát. */
function pageKey(url) {
  const key = new URL(url.href);
  key.hash = "";
  return key.href;
}

async function putPage(key, response) {
  try {
    const cache = await caches.open(PAGES_CACHE);
    await cache.put(key, response);
    await trimPages(cache);
  } catch (error) {
    // Plné alebo vypnuté úložisko. Offline režim proste nebude — appka beží.
  }
}

async function matchPage(key) {
  try {
    const cache = await caches.open(PAGES_CACHE);
    return await cache.match(key, { ignoreVary: true });
  } catch (error) {
    return undefined;
  }
}

async function deletePage(key) {
  try {
    const cache = await caches.open(PAGES_CACHE);
    await cache.delete(key, { ignoreVary: true });
  } catch (error) {
    // Nič sa nedeje, cache neexistuje.
  }
}

async function trimPages(cache) {
  try {
    const keys = await cache.keys();
    const excess = keys.length - MAX_PAGES;
    for (let i = 0; i < excess; i += 1) {
      const key = keys[i];
      if (key) await cache.delete(key);
    }
  } catch (error) {
    // Orezanie je iba upratovanie, jeho zlyhanie nikoho nebolí.
  }
}

async function cacheOfflinePage() {
  try {
    const cache = await caches.open(STATIC_CACHE);
    // `cache: "reload"` obíde HTTP cache, nech máme naozaj čerstvú verziu.
    await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
  } catch (error) {
    // Bez predpripravenej stránky máme vstavanú náhradu FALLBACK_HTML.
  }
}

async function matchOfflinePage() {
  try {
    return await caches.match(OFFLINE_URL, { ignoreVary: true, ignoreSearch: true });
  } catch (error) {
    return undefined;
  }
}

async function deleteForeignCaches() {
  try {
    const names = await caches.keys();
    await Promise.all(
      names.map((name) => (OWN_CACHES.indexOf(name) === -1 ? caches.delete(name) : null)),
    );
  } catch (error) {
    // Nevadí, staré verzie zmizneme nabudúce.
  }
}

function replyTo(event, message) {
  try {
    const port = event.ports && event.ports[0];
    if (port) port.postMessage(message);
  } catch (error) {
    // Volajúci si odpoveď nevypýtal.
  }
}
