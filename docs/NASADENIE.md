# Nasadenie

Postup, ako si appku rozbehnúť na **vlastných** účtoch: GitHub (kód), Neon
(databáza), Google (prihlásenie), Vercel (hosting) a cron-job.org
(pripomienky). Všetko v bezplatných plánoch — cena celého setupu je **0 €**.
Stručná anglická verzia je v [DEPLOY.md](DEPLOY.md).

Appka je osobná: jeden človek, prípadne pár ľudí, z ktorých každý vidí len
svoje dáta. Kto sa smie prihlásiť, určuje zoznam e-mailov v `ALLOWED_EMAILS` —
nie je to služba, do ktorej sa registruje verejnosť.

**Poradie je zámerné a nedá sa preskakovať.** Vercel nasadzuje to, čo je
v repozitári na GitHube, a Google musí poznať adresu appky, ktorú Vercel
pridelí až pri prvom nasadení:

```
GitHub → Neon → Google → Vercel → adresa späť do Googlu → pripomienky → telefón
  (1)     (2)     (3)      (4)             (4)                 (5)         (6)
```

Nepovinné doplnky — školský rozvrh z EduPage (7) a Google Kalendár (8) — sa
dajú pridať kedykoľvek neskôr.

---

## 1. Vlastná kópia kódu na GitHube

Sprav si **fork** repozitára (tlačidlo *Fork* vpravo hore). Vercel nasadzuje
z tvojho repozitára a každý push do vetvy `main` znamená nové nasadenie.
Novinky z pôvodného repozitára si neskôr stiahneš tlačidlom **Sync fork**.

Vo forku GitHub workflowy nespúšťa, kým ich v záložke **Actions** nepovolíš:

| Workflow | Čo robí | Treba? |
|---|---|---|
| **Kontrola** | preklad, testy, lint, migrácie na čistom Postgrese a build pri každom pushi | odporúčané — tajomstvá nepotrebuje |
| **Pripomienky**, **Rozvrh** | záložný plánovač (sekcia 5) | nie — hlavný plánovač je cron-job.org |

Záložné workflowy bez tajomstiev **zámerne zlyhajú** pri každom behu (prečo, je
v sekcii 5) a GitHub ti o každom zlyhaní pošle e-mail. Kto ich nechce, nech ich
nechá vypnuté: **Actions → workflow → ⋯ → Disable workflow**.

---

## 2. Databáza — Neon

1. Na [neon.tech](https://neon.tech) sa zaregistruj a založ projekt
   (**New project**). Verziu Postgresu nechaj predvolenú.
2. **Región** vyber blízko seba a ten istý neskôr nastav aj pre funkcie na
   Verceli (sekcia 4) — napr. AWS Europe Central (Frankfurt) a na Verceli
   `fra1`. Každý dopyt appky cestuje medzi nimi a cez oceán je to citeľné pri
   každom kliknutí.
3. **Connect** → skopíruj connection string. Stačí **priame spojenie** (bez
   `-pooler` v názve hostiteľa): migrácia pri nasadení sa proti súbežnému
   buildu chráni zámkom viazaným na spojenie (`pg_advisory_lock`) a pooler
   v režime transakcií taký zámok spoľahlivo nedrží. Pri jednom-dvoch ľuďoch
   pooler aj tak nič nezrýchli.

Schému nahrávať **netreba** — vytvorí ju prvé produkčné nasadenie na Verceli
(podrobne v sekcii [Migrácie pri aktualizácii](#migrácie-pri-aktualizácii)).
Keby si ju niekedy potreboval pustiť ručne:

```bash
DATABASE_URL="<connection-string>" npm run db:migrate
```

V PowerShell tá bashová syntax nefunguje — tam to je:

```powershell
$env:DATABASE_URL="<connection-string>"; npm run db:migrate
```

> **Connection string je heslo k databáze.** Nevkladaj ho do chatu, issues ani
> commitov. Keby sa predsa dostal von, v Neone **Roles → tvoja rola → Reset
> password** vymení heslo; schéma aj dáta ostávajú. Nový string potom zmeň aj
> na Verceli a redeployni.

---

## 3. Google OAuth

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Vytvor projekt, napr. `task-manazer`.
3. **OAuth consent screen** (v novšej konzole *Google Auth Platform*) →
   *External*, stav *Testing*, a medzi **Test users** pridaj svoj gmail. Kým je
   appka v režime *Testing*, prihlási sa len ten, kto je v tomto zozname.
4. **Create credentials → OAuth client ID → Web application**.
5. **Authorized redirect URIs** — zatiaľ pridaj len
   `http://localhost:3000/api/auth/callback/google`.
   Adresu z Vercelu doplníš v sekcii 4, keď ju budeš poznať.
6. Skopíruj *Client ID* a *Client secret*.

Prihlásenie pýta len identitu. Prístup ku kalendáru je nepovinný a pridáva sa
až v sekcii 8.

---

## 4. Vercel

1. Na [vercel.com](https://vercel.com) sa prihlás cez GitHub → **Add New →
   Project** → vyber svoj fork.
2. Framework sa rozpozná automaticky (Next.js). Build ani output nastavenia
   **nemeň** — `npm run build` pred samotným buildom migruje databázu.
3. **Environment Variables** — pridaj tieto, všetky pre **Production**:

| Premenná | Hodnota |
|---|---|
| `DATABASE_URL` | connection string z Neonu |
| `AUTH_SECRET` | výstup príkazu `npx auth secret` |
| `AUTH_GOOGLE_ID` | Client ID z Googlu |
| `AUTH_GOOGLE_SECRET` | Client secret z Googlu |
| `ALLOWED_EMAILS` | tvoj gmail, napr. `ja@gmail.com` — viac ľudí oddeľ čiarkou |

Premenné na notifikácie sú v sekcii 5, na `.apk` v sekcii 6 a na rozvrh
v sekcii 7. Úplný zoznam s vysvetlivkami je v [`.env.example`](../.env.example).

> `AUTH_DEV_BYPASS` na Vercel **nepridávaj**. Aj keby si ho pridal, v produkcii
> je vypnutý natvrdo v kóde — ale nech tam nie je ani omylom.

4. **Deploy**. Prvý build vytvorí v Neone schému — vo výpise buildu hľadaj
   „Púšťam migrácie".
5. Po nasadení skopíruj **stabilnú** adresu (v paneli projektu pod *Domains*,
   tvar `nazov-projektu.vercel.app` alebo `nazov-projektu-nieco-NN.vercel.app`)
   a dokonči nastavenie:
   - v Google Console doplň redirect URI
     `https://TVOJA-ADRESA.vercel.app/api/auth/callback/google`,
   - na Verceli pridaj premennú `AUTH_URL` = `https://TVOJA-ADRESA.vercel.app`
     (bez lomítka na konci),
   - v **Settings → Build and Deployment** nastav *Node.js Version* na
     **24.x** — tú istú, na ktorej beží CI a ktorú určuje `.nvmrc`,
   - v **Settings → Functions** nastav región blízko Neonu (sekcia 2),
   - **Redeploy** (prečo, je nižšie).
6. Otvor **stabilnú adresu** v prehliadači a prihlás sa cez Google. Účet ti
   vznikne pri prvom prihlásení, spolu s piatimi predvolenými oblasťami.

> **`AUTH_URL` nevynechaj.** Vercel dáva každému nasadeniu okrem stabilnej
> adresy aj vlastnú jednorazovú (`nazov-projektu-abc123xyz-….vercel.app`),
> ktorá sa pri každom redeployi mení — a práve na ňu ťa hodí tlačidlo
> **Visit** v paneli. Bez `AUTH_URL` si appka postaví prihlasovaciu adresu
> z tej jednorazovej, Google ju nepozná a vráti
> `Chyba 400: redirect_uri_mismatch`. S `AUTH_URL` sa callback stavia vždy
> zo stabilnej adresy, nech prídeš odkiaľkoľvek.

### ⚠️ Premenné sa načítajú až pri novom nasadení

Vercel vkladá premenné do nasadenia v momente jeho vzniku. Keď premennú
pridáš alebo zmeníš, bežiace nasadenie o nej **nikdy nebude vedieť** —
v nastaveniach ju vidíš, ale appka ju nemá.

Po každej zmene premenných: **Deployments → posledné → ⋯ → Redeploy**.

---

## 5. Pripomienky (notifikácie)

Kým nespravíš tieto kroky, appka sa na notifikácie ani neopýta — a to je
zámer. Bez kľúčov VAPID sa sekcia „Pripomienky" v nastaveniach vôbec
nevykreslí; ponúkať tlačidlo, ktoré vždy zlyhá, je horšie než ho nemať.

### Čo to vlastne robí

Notifikácia sa **nedá naplánovať priamo v telefóne** — API, ktoré by to
vedelo (Notification Triggers), Google zastavil. Ostáva Web Push, teda
odoslanie zo servera. Server sa musí niekde budiť a Vercel Hobby dovolí
vlastný cron len raz denne, čo je na pripomienky nepoužiteľné. Budí ho preto
externý cron, ktorý volá `/api/pripomienky`.

Plánovač berie len pripomienky, ktoré už dozreli — môžu teda meškať, ale
nikdy neprídu skôr. Kto chce mať náskok, nastaví si v appke predstih.

> **Prečo cron-job.org a nie GitHub Actions.** Pôvodne appku budil workflow
> v GitHub Actions nastavený na štvrťhodinu. GitHub ho toľkokrát nepustí:
> v nameranom období (68 behov za 4 dni, august 2026) bol medzi dvoma
> skutočnými behmi medián **39 minút**, priemer **85 minút** a najdlhšia
> medzera **11,6 hodiny**. Pripomienka staršia než 6 hodín sa zahadzuje
> (`MAX_MESKANIE_MIN`), takže v medzerách nad šesť hodín **nedôjde vôbec** —
> a to bolo 18 % času. V septembri boli medzery bežne štyri až päť hodín.
>
> Externý cron je preto hlavný plánovač a GitHub workflow už len záloha.
> Appke je jedno, kto na adresu zavolá — dôležitá je hlavička s tajomstvom.

### 5.1 Kľúče VAPID

VAPID je podpis, ktorým sa appka predstaví push službe prehliadača. Kľúče si
vygeneruješ raz a **už nikdy ich nemeň** — po zmene prestanú platiť všetky
existujúce prihlásenia a každý sa musí prihlásiť znova.

```bash
npx web-push generate-vapid-keys
```

Vypíše dvojicu `Public Key` / `Private Key`.

### 5.2 Premenné na Verceli

**Settings → Environment Variables**, všetky pre **Production**:

| Premenná | Hodnota |
|---|---|
| `VAPID_PUBLIC_KEY` | `Public Key` z predošlého kroku |
| `VAPID_PRIVATE_KEY` | `Private Key` z predošlého kroku |
| `VAPID_SUBJECT` | *(nepovinné)* kontakt, napr. `mailto:ja@gmail.com`; bez neho sa použije `AUTH_URL` |
| `CRON_SECRET` | dlhé náhodné tajomstvo, napr. výstup `npx auth secret` |

`CRON_SECRET` je jediné, čo cesty `/api/pripomienky` a `/api/rozvrh` stráži —
nikto pri nich nie je prihlásený. **Kým nie je nastavené, obe vracajú 401
každému**, aj cronu. Je to fail-closed zámerne: otvorená cesta by znamenala,
že ktokoľvek vie appke povedať, nech rozpošle notifikácie.

Nezabudni na **Redeploy** — premenné sa načítajú až pri novom nasadení.

### 5.3 Externý cron (cron-job.org) — hlavný plánovač

Zadarmo, bez karty, spoľahlivý na minútu. Na [cron-job.org](https://cron-job.org)
sa zaregistruj a založ úlohu (*Create cronjob*); druhú až vtedy, keď budeš
chcieť rozvrh zo školy (sekcia 7):

| | Pripomienky | Rozvrh *(nepovinné)* |
|---|---|---|
| **URL** | `https://TVOJA-ADRESA.vercel.app/api/pripomienky` | `https://TVOJA-ADRESA.vercel.app/api/rozvrh` |
| **Execution schedule** | každých 5 minút | každú hodinu, 6:00–20:00, pondelok–piatok |
| **Advanced → Request method** | `POST` | `POST` |
| **Advanced → Headers** | `Authorization: Bearer TAJOMSTVO` | `Authorization: Bearer TAJOMSTVO` |
| **Advanced → Timeout** | 30 s | 30 s |

`TAJOMSTVO` je hodnota `CRON_SECRET` z Vercelu. Časové pásmo úlohy nastav na
svoje (napr. `Europe/Bratislava`), nech „6:00–20:00" znamená tvoj deň.

**Prečo rozvrh každú hodinu cez deň:** suplovanie chodí v odbere ako šípka
v `SUMMARY` (`DEJ -> SJL`), takže zmena na dnešok sa dá chytiť ešte v ten
deň. Nočný beh by ju ukázal až zajtra.

**Overenie:** v cron-job.org → *History* má byť odpoveď `200` a v tele
`"ok":true`. Kód `401` znamená nezhodu tajomstva, `503` chýbajúce kľúče VAPID
(pripomienky) alebo `SKOLA_ICS_URL` (rozvrh).

### 5.4 Záloha cez GitHub Actions (nepovinné)

Workflowy **Pripomienky** a **Rozvrh** volajú tie isté adresy. Keď externý
cron vypadne, pokryjú to aspoň po svojom. Dvojité odoslanie nehrozí: riadok
v `reminders` sa zapisuje pred odoslaním a jedinečný index (`task_id`, `at`)
druhý pokus zastaví.

**Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Hodnota |
|---|---|
| `PRIPOMIENKY_URL` | `https://TVOJA-ADRESA.vercel.app/api/pripomienky` |
| `ROZVRH_URL` | `https://TVOJA-ADRESA.vercel.app/api/rozvrh` *(len s rozvrhom)* |
| `CRON_SECRET` | **to isté** tajomstvo, aké je na Verceli |

Zálohu **zapni premennou** — tamže, záložka **Variables → New repository
variable**: `ZALOZNY_PLANOVAC` = `1`. Bez nej sa naplánované behy preskočia,
aby kópia repozitára, ktorá nič nenastavila, neposielala každých 15 minút
e-mail o zlyhaní. Potom workflowy povoľ v záložke **Actions** (sekcia 1).
**Keď je záloha zapnutá a tajomstvá chýbajú, beh zlyhá** — nech je na prvý
pohľad vidno, že sa pripomienky neodosielajú. Ručné spustenie
(*Run workflow*) beží aj bez premennej, takže sa nastavenie dá overiť vopred.

> Vo **verejnom** repozitári GitHub naplánované workflowy sám vypne, keď sa
> v repozitári 60 dní nič nedeje. Záloha tak môže potichu zaspať — ďalší
> dôvod, prečo je hlavný plánovač inde.
>
> V **súkromnom** repozitári sa každý beh počíta ako aspoň celá minúta
> z 2 000 bezplatných minút mesačne. Štvrťhodinový plán by ich vyčerpal, keby
> ho GitHub naozaj dodržal. Fork verejného repozitára je verejný, tam minúty
> nič nestoja.

### Overenie

1. V appke **Nastavenia → Pripomienky → Zapnúť pripomienky v tomto
   prehliadači.** Prehliadač sa spýta na povolenie.
2. Vytvor úlohu s **hodinou** (nielen dňom) na čas o pár minút dozadu.
3. Počkaj na najbližší beh cronu, alebo plánovač zavolaj ručne (`curl`
   nižšie, prípadne **Actions → Pripomienky → Run workflow**). Notifikácia má
   prísť.

**Prihlásenie platí pre jeden prehliadač, nie pre človeka.** Telefón a notebook
sa prihlasujú zvlášť.

> **Povolenie sa dá odmietnuť len raz.** Keď ho v prehliadači zakážeš, appka
> sa druhýkrát opýtať NEMÔŽE — musíš ho vrátiť v nastaveniach stránky (ikona
> vedľa adresy). Appka to v tom stave aj napíše.

### Keď notifikácie nechodia

| Príznak | Príčina |
|---|---|
| **Cron je zelený, ale nič nechodí** | pozri nižšie — najzákernejší prípad |
| Workflow zlyhá s „Chýba PRIPOMIENKY_URL alebo CRON_SECRET" | tajomstvá nie sú v repozitári (pozor: záložka **Actions**, nie Codespaces ani Dependabot) |
| Sekcia „Pripomienky" v nastaveniach nie je | chýbajú `VAPID_*` na Verceli, alebo nebol Redeploy |
| Odpoveď `503` | to isté |
| Odpoveď `401` | `CRON_SECRET` v cron-job.org alebo na GitHube ≠ na Verceli |
| `preverenych: 0` | žiadna úloha nemá **hodinu** a žiadna blízka udalosť nemá zapnutú pripomienku — bez toho sa nepripomína nič |
| `odoslanych: 0`, ale `preverenych` > 0 | pripomienka už raz odišla (`reminders` a `agenda_reminders` si to pamätajú), alebo sa na ňu ešte len čaká |
| **`zahodenychStarych` > 0** | plánovač nebežal dosť dlho — tieto pripomienky už nikdy neprídu. Skontroluj, či cron-job.org beží |
| `500` a v logu `relation "…" does not exist` | nedobehla migrácia — pozri výpis posledného buildu na Verceli |
| `zmazanychPrihlaseni` > 0 | prihlásenie zaniklo (odinštalovaná appka, vymazané dáta stránky) — treba sa prihlásiť znova |

### Zelený beh ešte neznamená, že sa niečo odoslalo

Toto sa naozaj stalo: workflow vyhodnotil 68 behov ako úspešné a pritom appku
ani raz nekontaktoval — bez tajomstiev sa totiž ticho preskakoval. Odvtedy taký
beh **zlyhá**, ale keby si niekedy potreboval overiť, či volanie naozaj
dorazilo, nepozeraj sa na cron, ale na **Vercel → Logs**. Filtruj
`/api/pripomienky`. Čo tam nie je, sa nestalo.

Rovnako sa dá endpoint kedykoľvek vyskúšať ručne:

```bash
curl -s -X POST "https://TVOJA-ADRESA.vercel.app/api/pripomienky" -H "Authorization: Bearer TAJOMSTVO" -H "Content-Length: 0" -w "
kod: %{http_code}
"
```

---

## 6. Inštalácia na telefón

PWA sa dá nainštalovať **iba z HTTPS adresy** — z localhostu to nejde. Preto
až po nasadení.

### Android

1. Otvor adresu v **Chrome** na telefóne a prihlás sa.
2. Chrome by mal sám ponúknuť lištu *„Pridať aplikáciu na plochu"*. Ak sa
   neobjaví, menu **⋮ → Pridať na plochu** (v novších verziách *Inštalovať
   aplikáciu*).
3. Potvrď názov **Úlohy**.

Po inštalácii sa appka spustí vo vlastnom okne bez adresného riadku, s vlastnou
ikonou v zozname aplikácií a vlastným záznamom v prepínači úloh. **Podržaním
ikony** sa dostaneš rovno na **Dnes** alebo **Inbox**.

### iPhone

Safari → **Zdieľať → Pridať na plochu**. Web push Apple dovolí len
nainštalovanej appke (iOS 16.4 a novší), takže pripomienky zapínaj až v nej.
Appka sa vyvíja a používa na Androide; na iOS nie je vyskúšaná.

### Vlastné `.apk` (TWA)

Nainštalovaná PWA z kroku vyššie stačí na bežné používanie. `.apk` sa hodí,
ak chceš appku rozposlať alebo ju mať v zozname aplikácií ako každú inú.

Vo vnútri `.apk` beží skutočný Chrome, ktorý zobrazuje túto stránku —
**jeden kód, jedno nasadenie**. Zmena na Verceli je v appke hneď a netreba
nič preinštalovať.

Aby appka nemala navrchu adresný riadok, musí Android overiť, že stránka
a appka patria k sebe. Slúži na to `/.well-known/assetlinks.json`, ktorý
appka **už vie vydať** — chýbajú mu len dve premenné:

1. Postav `.apk` (napr. cez [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
   alebo [PWABuilder](https://www.pwabuilder.com/)) a nechaj si vytvoriť
   podpisový kľúč. **Kľúč si odlož** — bez neho sa appka nedá aktualizovať.
2. Zisti odtlačok:

   ```
   keytool -list -v -keystore android.keystore -alias android
   ```

   Z výpisu potrebuješ riadok `SHA256:` — 32 dvojíc oddelených dvojbodkou.
3. Na Verceli nastav `ANDROID_PACKAGE_NAME` (názov balíka z kroku 1, napr.
   `com.example.ulohy`) a `ANDROID_CERT_FINGERPRINTS` (odtlačok, viac oddeľ
   čiarkou) a **redeployni** (premenné sa vkladajú pri vzniku nasadenia).
4. Skontroluj, že `https://TVOJA-ADRESA/.well-known/assetlinks.json` vracia
   JSON. **Kým premenné nie sú nastavené, vracia 404** — a je to tak správne:
   prázdny súbor by Android stiahol, nenašiel by v ňom svoj kľúč a overenie by
   SKONČILO neúspechom namiesto toho, aby sa naň dalo počkať.
5. Nainštaluj `.apk`. Ak adresný riadok zmizol, odtlačok sedí.

> **Ak appku niekedy dáš do Google Play,** Play si ju podpíše vlastným kľúčom
> a odtlačok sa zmení. Vtedy do premennej patria **oba** — svoj aj ten z Play
> Console (oddelené čiarkou). Appka ich unesie viac naraz.

> **Prihlásenie cez Google v TWA funguje**, lebo vnútri beží skutočný Chrome.
> Neplatí to pre natívny obal (Capacitor a spol.): tam Google prihlásenie vo
> vnorenom prehliadači blokuje.

### Čo funguje bez signálu

- **Zachytenie novej úlohy** — uloží sa v telefóne a odošle sa, len čo budeš
  online. V rohu uvidíš, koľko vecí čaká.
- **Zobrazenie naposledy načítaných obrazoviek.**

Nefunguje offline: úprava a mazanie úloh, presúvanie v týždni. To by si
vyžiadalo plný local-first prepis — vedome sme ho odložili.

---

## 7. Školský rozvrh (EduPage) — nepovinné

Rozvrh sa ťahá z **Webcal odberu** — EduPage → Nastavenia → Ostatné → Môj
profil → *Enable Webcal*. Je to živá adresa, ktorá nesie tvoj rozvrh; kto ju
má, vidí, kde si kedy.

**Na Vercel** (Settings → Environment Variables):

    SKOLA_ICS_URL     adresa odberu (aj `webcal://`, appka si ju prepíše)

Adresa odberu do GitHubu ani do cron-job.org NEPATRÍ — appka si ju vytiahne
sama z premenných a nikdy ju nevydá von, ani do chybovej hlášky. Cron volá
len `/api/rozvrh` (sekcia 5.3).

**Adresa odberu je jedna na celú appku**, takže automatická synchronizácia je
pre jedného človeka. Keď rozvrh má viac ľudí, cron radšej neurobí nič
(odpovie `409`): nedá sa uhádnuť, komu adresa patrí.

### Prvý import treba spraviť ručne

Cron načíta rozvrh tomu, kto už predmety má — teda tomu, kto raz prešiel
ručným importom na obrazovke **Rozvrh** a **vybral si skupiny**. Bez nich by
sa stiahli dvojité okienka celej triedy. Ručný import funguje aj bez
`SKOLA_ICS_URL`: stačí nahrať stiahnutý `.ics` súbor.

### Ako často

Suplovanie v odbere **je**, len ako šípka v `SUMMARY` (`DEJ -> SJL`).
Prázdniny v ňom naozaj nie sú (15. 9. aj 17. 11. sú štátne sviatky a feed na
nich má plných osem hodín), tie sa zapisujú ručne; štátne sviatky appka
doplní na jedno kliknutie.

Aby sa suplovanie na dnešok ukázalo ešte v ten deň, hlavný plánovač je
externý cron každú hodinu cez školský deň (sekcia 5.3). GitHub workflow
**Rozvrh** ostáva ako záloha. Cez tlačidlo *Stiahnuť z EduPage* na obrazovke
rozvrhu sa dá pustiť kedykoľvek ručne.

Rozhodnutia za rozvrhom sú v [ROZVRH.md](ROZVRH.md).

---

## 8. Google Kalendár — nepovinné

Kým nespravíš tieto tri kroky, porady sa nezobrazia. Appka medzitým beží
normálne — kalendár je doplnok, nie podmienka.

1. **Google Cloud Console → APIs & Services → Library** → zapni
   **Google Calendar API**.
2. **OAuth consent screen → Scopes** (v novšej konzole *Data Access*) →
   pridaj `https://www.googleapis.com/auth/calendar.readonly`.
3. V appke **Nastavenia → Google Kalendár → Prepojiť kalendár**. Google sa
   spýta na súhlas s čítaním kalendára — prihlásenie samo o sebe ho zámerne
   nepýta.

Keď porady stále nevidno, pozri logy na Verceli. Hľadaj riadky začínajúce
`[calendar]` alebo `[google-tokens]` — obe vrstvy zlyhanie zapisujú a nikdy
ho nevyhodia na obrazovku.

Keď sa kalendár pokazí (napr. vypršal súhlas), v tej istej karte ho **odpoj**
a prepoj znova. Prepojenie si vždy vypýta nový súhlas, takže Google pošle aj
nový refresh token.

> **Režim *Testing* a sedem dní.** Kým je appka v Google Console v režime
> *Testing*, súhlas s kalendárom vyprší po siedmich dňoch a treba ho obnoviť.
> Prihlásenia do appky sa to netýka. Prepnutie do produkcie znamená pri scope
> kalendára buď overenie appky Googlom, alebo varovanie „neoverená aplikácia"
> pri každom súhlase — pre osobnú appku sa ani jedno neoplatí.

---

## Migrácie pri aktualizácii

**Nemusíš robiť nič.** Migrácia dobehne sama pri produkčnom nasadení, ako prvý
krok `npm run build`:

```
npm run db:migrate:nasadenie   →   npm run kontrola:migracie   →   next build
```

Connection string sa nikam neprelepuje — `DATABASE_URL` je na Verceli už kvôli
samotnej appke a migračný krok siahne po tej istej premennej.

Poradie teda je: `git push` (alebo *Sync fork*) → Vercel migruje → Vercel
nasadí. Lokálne sa migrácie púšťajú samy pri štarte PGlite, takže rozdiel
medzi vývojom a produkciou zmizol.

### Kedy sa migrácia NEPUSTÍ

| Situácia | Prečo |
|---|---|
| náhľadový (preview) build | stavia neschválenú vetvu, ale mohol by mieriť na tú istú produkčnú databázu |
| lokálny `npm run build` | aj keď máš v prostredí produkčnú premennú — na ostrú databázu sa nesmie siahnuť omylom |
| iný hosting než Vercel | rozhoduje `VERCEL_ENV=production`, ktorú nastavuje len Vercel |
| bez `DATABASE_URL` | beží PGlite, ktorý sa migruje sám |
| `SKIP_MIGRATION=1` | únikový východ, keby sa pokazil samotný krok |

Vynútiť sa dá cez `MIGROVAT_PRI_BUILDE=1` — **na inom hostingu ju nastav**,
inak build zastaví brána nižšie. Rozhoduje o tom jediná funkcia
(`dovodPreskocenia` v `scripts/migracie.mjs`) a má vlastné testy — je to
jediné miesto, ktoré určuje, či sa siahne na ostrú databázu.

### Brána ostáva

Za migráciou beží `npm run kontrola:migracie`. Nie je to zdvojenie: migrácia
sa zámerne nepúšťa všade, takže kontrola je jediné miesto, ktoré platí
**vždy** — a keby migrátor skončil bez chyby a databázu nezmenil, zachytí to
ona namiesto používateľa. Keď v repozitári leží migrácia, ktorá v produkcii
nedobehla, **nasadenie zlyhá** a Vercel ostane na poslednej funkčnej verzii.

Stalo sa to raz naozaj, ešte pred bránou: 30. 8. 2026 sa nasadil stĺpec
`stays_on_day` bez migrácie a spadli všetky obrazovky za prihlásením. Zlyhaný
build je nepríjemnosť, spadnutá appka je výpadok.

Kontrola chytí aj druhý prípad — **už nasadenú migráciu, ktorej sa zmenil
súbor**. Migrátor ju druhýkrát nepustí (rozhoduje sa podľa času, nie podľa
obsahu), takže by rozdiel ticho ležal v repozitári. Riešenie je vrátiť zmenu
a vygenerovať novú migráciu.

Keby sa kontrola sama pokazila a blokovala opravu, pusti build s premennou
`SKIP_MIGRATION_CHECK=1`. Bez `DATABASE_URL` sa preskočí sama — lokálny PGlite
sa migruje pri štarte.

### Na čo sa tým spoliehame

**Migrácie musia ostať pridávacie.** Keď migrácia dobehne a build potom
zlyhá na niečom inom (preklad, test), v databáze je nová schéma, ale navonok
ďalej beží stará verzia appky. Pridaný stĺpec starému kódu neprekáža —
zmazaný alebo premenovaný by ho zložil. Keby raz prišla naozaj búracia
migrácia, pusti ju ručne a mimo nasadenia:

```powershell
$env:DATABASE_URL="<connection-string>"; npm run db:migrate
```

### Zlyhaný build sa sám neopakuje

Keď build padne (napr. migrácia nedobehla), Vercel ostane na starej verzii
a **sám to znova neskúsi**. Po odstránení príčiny treba v *Deployments*
kliknúť **Redeploy** — alebo pushnúť čokoľvek ďalšie.

Naplnenie ukážkovými úlohami (voliteľné, idempotentné; úlohy dostane prvý
e-mail z `ALLOWED_EMAILS`):

```powershell
$env:DATABASE_URL="<connection-string>"; $env:ALLOWED_EMAILS="ja@gmail.com"; npm run db:seed
```

---

## Lokálne s Google prihlásením

Ak chceš aj lokálne testovať skutočné prihlásenie, do `.env.local`:

```
AUTH_SECRET=vystup-z-npx-auth-secret
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_DEV_BYPASS=0
```

`DATABASE_URL` lokálne **nenastavuj** — bez neho beží vstavaný PGlite, ktorý
je rýchlejší, funguje offline a nemíňa Neon.

Service worker je v dev režime zámerne vypnutý, inak by cachoval a rozbil hot
reload. Otestovať sa dá len na produkčnom builde:

```bash
npm run build && npm run start
```

---

## Bezpečnosť

`ALLOWED_EMAILS` je jediná zábrana pri vstupe — prihlásiť sa smú iba e-maily
z tohto zoznamu (oddeľujú sa čiarkou), ostatných Google účtov sa `signIn`
callback zbaví.

**Ak ju v produkcii nenastavíš, neprihlási sa nikto.** Je to zámerne: dovtedy
platil opak a zabudnutá premenná ticho otvorila appku každému, kto má Google
účet. Zamknuté dvere sú menšie zlo než dokorán otvorené — keď sa nevieš
prihlásiť, prvé, čo skontroluj, je práve táto premenná.

Lokálne (mimo produkcie) sa zoznam nevyžaduje, aby sa dal vývoj rozbehnúť bez
`.env`.

Starý názov `ALLOWED_EMAIL` s jednou hodnotou stále funguje ako záloha, takže
sa staršie nasadenie nerozbije skôr, než premennú na Verceli premenuješ.

Service worker odkladá do cache aj HTML s tvojimi úlohami, aby fungoval
offline. Na vlastnom telefóne je to v poriadku; na cudzom zariadení sa
neprihlasuj.

### Pridanie ďalšieho človeka

1. V Google Cloud Console → **OAuth consent screen → Test users** pridaj jeho
   gmail. Kým je appka v režime *Testing*, dnu sa dostane len ten, kto je
   v tomto zozname (max 100 ľudí).
2. Doplň jeho e-mail do `ALLOWED_EMAILS` na Verceli a redeployni.
3. Účet mu vznikne **až pri prvom prihlásení** — dostane vlastné id, vlastné
   nastavenia a päticu predvolených oblastí. Dáta sú oddelené: navzájom sa
   nevidíte.

Školský rozvrh z EduPage je výnimka — adresa odberu je jedna na celú appku
(sekcia 7).
