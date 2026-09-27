# Claude a MCP

Task manažér má vlastný MCP server. Claude (na počítači, na webe aj v mobile)
si cez neho prečíta tvoj deň a urobí s tebou ranný rituál: zhrnie školu,
porady, udalosti a úlohy, prejde prepadnuté, vyberie prioritu dňa a rituál
uzavrie — rovnako, ako keby si klikal v appke. Úlohy, udalosti a deadliny
vie aj zakladať a upravovať.

---

## Pripojenie

1. V Claude otvor **Settings → Connectors → Add custom connector**.
2. Vlož adresu z Nastavení appky, časť **Pripojené aplikácie** — napríklad
   `https://tvoja-adresa.vercel.app/api/mcp`.
3. Claude ťa pošle do appky. Prihlás sa ako vždy (Google) a na obrazovke
   súhlasu klikni **Povoliť**.

Konektor pridaný na claude.ai je dostupný aj v Claude Desktop a v mobilnej
appke. Odpojiť ho vieš v Claude aj v appke (Nastavenia → Pripojené
aplikácie → Odpojiť); po odpojení v appke prestanú tokeny platiť okamžite.

## Ranný rituál s Claude

Stačí napísať „urob so mnou ranný rituál". Server Claudovi v inštrukciách
opisuje poradie a ponúka aj hotový prompt **ranny-ritual**:

1. `start_morning_ritual` — dobehne opakované úlohy a vráti prehľad dňa,
2. prepadnuté úlohy — na dnes, na iný deň, alebo zahodiť (Claude navrhne,
   ty rozhodneš),
3. `set_priority_of_day` — jedna priorita dňa,
4. rozpočet času — keď je deň preplnený, Claude navrhne, čo presunúť,
5. `finish_morning_ritual` — rituál je v appke uzavretý a ráno sa už
   neotvorí.

## Nástroje

| Nástroj | Čo robí |
|---|---|
| `get_day` | prehľad dňa: otvorené a prepadnuté úlohy, priorita dňa, rozpočet času, rozvrh, porady, udalosti (a 14 dní dopredu), návyky, inbox |
| `get_inbox` | nezatriedené úlohy aj s poznámkami |
| `get_upcoming` | úlohy a udalosti na najbližšie dni |
| `search` | hľadanie ako v Archíve, vrátane hotových a prebehnutých; pri úlohe aj stav |
| `get_structure` | aktívne projekty, oblasti, predmety, štítky a kontexty — platné mená pre úpravy |
| `capture` | nová úloha zo zápisu rýchleho zachytenia (`zavolať Petrovi zajtra 15:00 !1`) |
| `plan_task` | naplánovať na deň (a tým vyradiť z inboxu), alebo presunúť na „Niekedy" |
| `update_task` | upraviť úlohu: názov, poznámka (aj doplniť), termín, čas, odhad, priorita, energia, kontext, celý deň, projekt, oblasť, predmet, štítky |
| `drop_task` | zahodiť — úloha ostane v archíve |
| `complete_task` | odškrtnúť |
| `reopen_task` | späť: hotovú otvoriť, zahodenú (aj zmazanú) vrátiť |
| `set_priority_of_day` | priorita dňa |
| `create_event` | nová udalosť, písomka, skúšanie, deadline či výlet s presnými poľami |
| `update_event` | upraviť udalosť: názov, druh, deň (ako „Presunúť"), koniec, čas, miesto, predmet, poznámka, zrušiť/obnoviť, známka |
| `start_morning_ritual`, `finish_morning_ritual` | začiatok a koniec ranného rituálu |

**Natvrdo nezmaže nič.** Zmeny idú cez tie isté serverové akcie ako tlačidlá
v appke — platí strážca odkladov (po niekoľkých odkladoch chce dôvod), jedna
priorita dňa, história úlohy aj dobiehanie opakovaných. Úprava mení polia,
nie riadky: zrušená udalosť ostane v zozname prečiarknutá a zahodenú úlohu
vráti `reopen_task`.

## Úpravy

Claude nielen zakladá a odškrtáva, ale aj upravuje — vždy len to, čo
pošle; `null` pole vymaže. Pred väčšou zmenou (presun udalosti, viac úloh
naraz, vymazanie poznámky) sa podľa inštrukcií servera najprv spýta.

- **Deň úlohy mení len `plan_task`.** `update_task` deň nemá, aby sa strážca
  odkladov nedal obísť.
- **Mená, nie id.** Projekt, oblasť a predmet Claude posiela menom tak, ako
  ho videl (predmet skratkou `MAT` alebo názvom). Porovnáva sa bez diakritiky
  a veľkosti písmen, ale nič sa nedomýšľa — pri neznámom mene vráti nástroj
  zoznam platných. Ponúkajú sa aktívne projekty a oblasti, ako vo výbere
  v appke.
- **Poznámka.** Model vidí z poznámky najviac 500 znakov (`noteTruncated`),
  preto dlhšiu dopĺňa cez `append_note` a neprepisuje ju celú.
- **Nový deň udalosti ide ako tlačidlo „Presunúť"** (`moveAgendaItem`):
  viacdňová sa posunie celá a písomka si nájde hodinu predmetu v nový deň.
  Nehotové úlohy pod udalosťou (príprava) sa posunú len s `shift_tasks` —
  to je v appke ponuka po presune a Claude sa má spýtať.
- **Písomka neprichádza o hodinu z rozvrhu.** Formulár udalosti
  (`updateAgendaItem`) berie čas ako ručný a väzbu na hodinu zahodí; úprava
  názvu či miesta by tak písomku odpojila od hodiny a rozpočet dňa by ju
  rátal druhýkrát. Keď úprava čas nemení, pošle sa písomka bez času
  a server hodinu nájde znova (`lessonSlotWanted` v `src/server/mcp/edit.ts`).
- **Opakovaná úloha.** `reopen_task` ďalší výskyt, ktorý vznikol pri
  odškrtnutí či zahodení, nezruší — vráti zoznam otvorených výskytov, aby to
  Claude povedal a prípadne duplicitu zahodil.

---

## Ako to funguje

```
Claude ──POST /api/mcp──▶ 401 + WWW-Authenticate (resource_metadata)
       ──GET /.well-known/oauth-protected-resource/api/mcp──▶ kde sa prihlásiť
       ──GET /.well-known/oauth-authorization-server──▶ koncové body
       ──POST /oauth/register──▶ client_id (RFC 7591)
       ──prehliadač: /oauth/authorize──▶ prihlásenie → súhlas → kód
       ──POST /oauth/token (kód + PKCE)──▶ access + refresh token
       ──POST /api/mcp s Bearer tokenom──▶ nástroje
```

- **Appka je sama sebe autorizačným serverom.** Prihlásenie pri súhlase je
  to isté ako do appky (Google, `ALLOWED_EMAILS`), takže pripojiť Clauda
  môže len ten, kto sa do appky dostane. Nič nové netreba nastavovať —
  žiadna premenná prostredia, žiadny účet navyše.
- **Registrácia klientov je otvorená** (RFC 7591), lebo Claude sa registruje
  sám. Zaregistrovaný klient však nesmie nič, kým človek neodklikne súhlas.
- **PKCE (S256) je povinné**, kód platí raz a desať minút. Adresa návratu
  sa musí zhodovať so zaregistrovanou presne; povolené sú len `https`
  a `http` na localhost.
- **Z tokenov sa ukladá len odtlačok** (SHA-256) v `oauth_grants`. Prístupový
  token platí hodinu, obnovovací dva mesiace a pri obnovení sa vymenia oba.
  Nové pripojenie toho istého klienta nahrádza staré.
- **MCP server je bez stavu** (Streamable HTTP, `enableJsonResponse`). Každá
  požiadavka overí token, načíta používateľa a vytvorí server nanovo — na
  Verceli môže ďalšia požiadavka pristáť na inej inštancii.
- **Nástroje volajú existujúce serverové akcie.** Tie si používateľa berú
  z `requireUser()`; `/api/mcp` ho po overení tokenu vloží do
  `AsyncLocalStorage` (`runAsUser` v `src/server/auth-guard.ts`), takže
  akcie fungujú bez session a bez jedinej zmeny.
- **Obrazovka súhlasu** ukazuje meno klienta (to si klient uvádza sám) aj
  adresu, kam sa vráti kód (tú sfalšovať nejde). Nedá sa vložiť do cudzej
  stránky (`frame-ancestors 'none'`).

Tabuľky `oauth_clients`, `oauth_codes`, `oauth_grants` nie sú v exporte —
sú to prístupové údaje, po obnove zo zálohy sa Claude jednoducho pripojí znova.

## Súbory

| Súbor | Čo v ňom je |
|---|---|
| `src/lib/oauth.ts` | čistá logika: tokeny, PKCE, adresy návratu (s testami) |
| `src/server/oauth.ts` | registrácia, kódy, tokeny, pripojené aplikácie |
| `src/app/oauth/*` | `/oauth/register`, `/oauth/token`, obrazovka súhlasu `/oauth/authorize` |
| `src/app/api/oauth/*` | metadáta (verejne pod `/.well-known/…`, prepis v `next.config.ts`) |
| `src/app/api/mcp/route.ts` | MCP endpoint |
| `src/server/mcp/*` | nástroje, prehľad dňa, tvar výstupov |
| `src/server/mcp/edit.ts` | čistá logika úprav: mená → id, záplata úlohy, formulár udalosti (s testami) |

## Riešenie problémov

| Príznak | Príčina |
|---|---|
| Claude hlási, že sa nevie pripojiť | adresa konektora musí končiť `/api/mcp` a appka musí byť nasadená s migráciou `0013_mcp_oauth` |
| Po prihlásení ťa to hodí na „Dnes" namiesto súhlasu | prihlasovacia stránka nedostala `?dalej=` — odober konektor a pridaj znova |
| „Pripojenie sa nedá dokončiť" | klient nie je zaregistrovaný alebo adresa návratu nesedí — odober konektor a pridaj znova |
| Nástroj vráti „odklad vyžaduje dôvod" | strážca odkladov; Claude sa spýta prečo a skúsi znova s dôvodom |

**Lokálne:** `npx @modelcontextprotocol/inspector`, adresa
`http://localhost:3000/api/mcp`, typ *Streamable HTTP*. Inspector prejde
celým OAuth tokom a prihlásiš sa vývojovým prihlásením.
