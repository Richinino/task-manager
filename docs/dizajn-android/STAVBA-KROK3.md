# Stavba, krok 3: upozornenia, zdieľanie, widget a dlaždica

Body z `docs/TELEFON.md`. Pravidlá zo `STAVBA-KROK1.md` platia ďalej
(slovenčina v UI, tokeny, testy čistej logiky v `src/lib/`, `npm run overit`,
brána `kontrola:dopyty` — každý dopyt na tabuľku používateľa má filter
`userId` alebo komentár `// bez-filtra: <dôvod>` ako v cron route).
Necommituj, dev server nespúšťaj.

## Databáza (HOTOVÉ, migrácia `0014_telefon_widget_notifikacie.sql`)

- `dailyPushes` (`daily_pushes`): `id`, `userId`, `date` (deň v pásme
  používateľa), `key`, `sentAt`; jedinečné (userId, date, key). Vložiť
  `.onConflictDoNothing().returning()` PRED odoslaním — 0 riadkov = už odoslané.
- `deviceTokens` (`device_tokens`): `id`, `userId`, `name`, `tokenHash`
  (SHA-256 cez `hashSecret` z `src/lib/oauth.ts`), `createdAt`, `lastUsedAt`,
  `revokedAt`. Token: `newSecret("tm_dt")` → `tm_dt_<base64url>`.

## Zmluva medzi webom a Androidom (záväzná pre oba agenty)

Host: `https://task-manager-kappa-steel-75.vercel.app`.

**Otvorenie zachytenia odkazom:** `/dnes?zachytit=1` otvorí rýchle
zachytenie; `/dnes?zachytit=1&text=<url-encoded>` ho predvyplní. Parameter sa
po otvorení z adresy odstráni (`router.replace`).

**Párovanie widgetu:** v Nastaveniach (sekcia „Telefón") tlačidlo
„Pripojiť widget" zavolá serverovú akciu, ktorá vytvorí token a vráti ho
(jediný raz v čistej podobe). Stránka potom prejde na
`intent://pair?token=<token>#Intent;scheme=ulohy;package=sk.taskmanazer.app;end`.
Android má aktivitu s intent-filtrom `scheme="ulohy" host="pair"`, token si
uloží do `SharedPreferences` („widget", kľúč „token"), ukáže krátku hlášku
„Widget je pripojený" a obnoví widgety.

**API widgetu** (hlavička `Authorization: Bearer tm_dt_…`, odpoveď JSON,
`Cache-Control: no-store`; neplatný/zrušený token → 401 `{ "error": "..." }`):

`GET /api/widget` →
```json
{
  "date": "2026-11-23",
  "dayLabel": "Pondelok 23. 11.",
  "summary": "Rezerva 3 h 55",
  "frog": { "id": "…", "title": "…", "estimate": "45 min" } | null,
  "tasks": [ { "id": "…", "title": "…", "estimate": "40 min" | null, "color": "#7a4fd6" } ],
  "openCount": 6,
  "inboxCount": 4
}
```
`tasks` = najviac 4 otvorené úlohy dňa okrem žaby (poradie ako na Dnes).
`color` = hex farba z `cardFill` (oblasť/predmet), inak `null`.

`POST /api/widget/hotovo` s telom `{ "taskId": "…" }` → odškrtne úlohu, ak
ešte nie je hotová (idempotentné — druhé volanie nič nevráti späť);
odpoveď `{ "ok": true }`.

**Deep linky z Androidu** otvárajú LauncherActivity (TWA) s `Intent.ACTION_VIEW`
a dátami URL: `https://<host>/dnes`, `https://<host>/dnes?zachytit=1`,
`https://<host>/nastavenia#telefon`.

**Zdieľanie do appky:** manifest `share_target` (GET, `/zdielat`, parametre
`title`, `text`, `url`); `/zdielat` presmeruje na
`/dnes?zachytit=1&text=<spojený text>`. Android TWA dostane intent-filter
`ACTION_SEND text/plain` s meta-dátami share targetu (androidbrowserhelper).
Fotky zatiaľ nie — appka nemá prílohy.
