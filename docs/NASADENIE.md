# Nasadenie

Kroky, ktoré musíš spraviť ty — vyžadujú prihlásenie do tvojich účtov. Cena celého setupu je **0 €**.

**Poradie je zámerné a nedá sa preskakovať.** Vercel nasadzuje to, čo je na GitHube — takže kým nie je hotový a pushnutý kód, nemá čo nasadiť. Preto:

```
kód hotový → commit → push na GitHub → Neon → Google → Vercel → inštalácia na telefón
   (ja)       (ja)        (ja)          (ty)   (ty)     (ty)          (ty)
```

---

## 0. Najprv: vyresetuj heslo v Neone

Pôvodné heslo prešlo cez chat a treba ho považovať za vyzradené.

Neon → tvoj projekt → **Roles** → `neondb_owner` → **Reset password**. Schéma aj dáta ostávajú, mení sa len heslo. Nový connection string si nechaj poruke, budeš ho potrebovať v kroku 3.

---

## 1. Databáza — Neon

Účet aj projekt už máš a **schéma je nahratá** (15 tabuliek). Ak by si niekedy potreboval začať odznova:

```bash
DATABASE_URL="<connection-string>" npm run db:migrate
```

V PowerShell tá bashová syntax nefunguje — tam to je:

```powershell
$env:DATABASE_URL="<connection-string>"; npm run db:migrate
```

### Migrácie pri novom míľniku

Neon sa **nemigruje sám**. Keď pribudne migrácia v `src/db/migrations/`, musí
sa pustiť RUČNE a **skôr, než sa nová verzia nasadí** — inak Vercel nasadí kód,
ktorý siaha na stĺpec, čo v produkcii ešte nie je.

```powershell
$env:DATABASE_URL="<connection-string>"; npm run db:migrate
```

Poradie je vždy: migrácia → `git push` → Vercel nasadí. Lokálne sa migrácie
púšťajú samy pri štarte, takže rozdiel medzi vývojom a produkciou je práve tu.

Naplnenie základnými oblasťami (voliteľné, idempotentné):

```powershell
$env:DATABASE_URL="<connection-string>"; npm run db:seed
```

---

## 2. Google OAuth

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Vytvor projekt, napr. `task-manazer`.
3. **OAuth consent screen** → *External*, typ *Testing*, pridaj svoj e-mail medzi testovacích používateľov.
4. Pridaj scope `https://www.googleapis.com/auth/calendar.readonly` — bude potrebný v M8 na čítanie kalendára.
5. **Create credentials → OAuth client ID → Web application**.
6. **Authorized redirect URIs** — zatiaľ pridaj len:
   `http://localhost:3000/api/auth/callback/google`
   Vercelovskú adresu doplníš v kroku 3, keď ju budeš poznať.
7. Skopíruj *Client ID* a *Client secret*.

---

## 3. Vercel

1. **Najprv skontroluj, že je na GitHube všetko** — repozitár `https://github.com/Richinino/task-manager`, vetva `main`. Musí tam byť aj PWA (súbory `src/app/manifest.ts`, `public/sw.js`, `src/lib/outbox.ts`). Vercel nasadzuje presne to, čo vidí na GitHube — keby si nasadil skôr, dostal by si appku bez offline režimu a bez možnosti nainštalovať ju na telefón.
2. Na [vercel.com](https://vercel.com) sa prihlás cez GitHub → **Add New → Project** → vyber `task-manager`.
3. Framework sa rozpozná automaticky (Next.js). Build ani output nastavenia **nemeň**.
4. **Environment Variables** — pridaj týchto šesť, všetky pre **Production**:

| Premenná | Hodnota |
|---|---|
| `DATABASE_URL` | connection string z Neonu |
| `AUTH_SECRET` | výstup príkazu `npx auth secret` |
| `AUTH_GOOGLE_ID` | Client ID z Googlu |
| `AUTH_GOOGLE_SECRET` | Client secret z Googlu |
| `ALLOWED_EMAILS` | `richard.pastyr@gmail.com` — viac ľudí oddeľ čiarkou |
| `AUTH_URL` | `https://TVOJA-ADRESA.vercel.app` — bez lomítka na konci |
| `ANDROID_PACKAGE_NAME` | *(nepovinné)* len pre `.apk` — napr. `com.richinino.taskmanazer` |
| `ANDROID_CERT_FINGERPRINTS` | *(nepovinné)* len pre `.apk` — odtlačok SHA-256, viac oddeľ čiarkou |

> `AUTH_DEV_BYPASS` na Vercel **nepridávaj**. Aj keby si ho pridal, v produkcii je vypnutý natvrdo v kóde — ale nech tam nie je ani omylom.

> **`AUTH_URL` nevynechaj.** Vercel dáva každému nasadeniu okrem stabilnej adresy aj vlastnú
> jednorazovú (`task-manager-2zpl2dlx3-….vercel.app`), ktorá sa pri každom redeployi mení —
> a práve na ňu ťa hodí tlačidlo **Visit** v paneli. Bez `AUTH_URL` si appka postaví
> prihlasovaciu adresu z tej jednorazovej, Google ju nepozná a vráti
> `Chyba 400: redirect_uri_mismatch`. S `AUTH_URL` sa callback stavia vždy zo stabilnej adresy,
> nech prídeš odkiaľkoľvek.

5. **Deploy**.
6. Po nasadení skopíruj **stabilnú** adresu (v paneli projektu pod *Domains*, tvar
   `task-manager-nieco-nieco-NN.vercel.app`) a **vráť sa do Google Console** doplniť redirect URI:
   `https://TVOJA-ADRESA.vercel.app/api/auth/callback/google`
   Rovnakú adresu daj aj do `AUTH_URL` (krok 4).
7. Otvor **stabilnú adresu** v prehliadači a prihlás sa cez Google.

### ⚠️ Premenné sa načítajú až pri novom nasadení

Vercel vkladá premenné do nasadenia v momente jeho vzniku. Keď premennú pridáš alebo zmeníš,
bežiace nasadenie o nej **nikdy nebude vedieť** — v nastaveniach ju vidíš, ale appka ju nemá.

Po každej zmene premenných: **Deployments → posledné → ⋯ → Redeploy**.

---

## 4. Inštalácia na Android

PWA sa dá nainštalovať **iba z HTTPS adresy** — z localhostu to nejde. Preto až teraz.

1. Otvor adresu v **Chrome** na telefóne a prihlás sa.
2. Chrome by mal sám ponúknuť lištu *„Pridať aplikáciu na plochu"*. Ak sa neobjaví, menu **⋮ → Pridať na plochu** (v novších verziách *Inštalovať aplikáciu*).
3. Potvrď názov **Úlohy**.

Po inštalácii sa appka spustí vo vlastnom okne bez adresného riadku, s vlastnou ikonou v zozname aplikácií a vlastným záznamom v prepínači úloh. **Podržaním ikony** sa dostaneš rovno na **Dnes** alebo **Inbox**.

> Android má plnú podporu manifestu vrátane skratiek. Súbor `src/app/apple-icon.tsx` v projekte ostáva pre prípad, že by si niekedy appku otvoril na iPade alebo Macu — má 41 riadkov a nič nestojí. Pokojne ho zmaž, ak ti prekáža.

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
3. Na Verceli nastav `ANDROID_PACKAGE_NAME` a `ANDROID_CERT_FINGERPRINTS`
   a **redeployni** (premenné sa vkladajú pri vzniku nasadenia).
4. Skontroluj, že `https://TVOJA-ADRESA/.well-known/assetlinks.json` vracia
   JSON. **Kým premenné nie sú nastavené, vracia 404** — a je to tak
   správne: prázdny súbor by Android stiahol, nenašiel by v ňom svoj kľúč
   a overenie by SKONČILO neúspechom namiesto toho, aby sa naň dalo počkať.
5. Nainštaluj `.apk`. Ak adresný riadok zmizol, odtlačok sedí.

> **Ak appku niekedy dáš do Google Play,** Play si ju podpíše vlastným
> kľúčom a odtlačok sa zmení. Vtedy do premennej patria **oba** — svoj aj
> ten z Play Console (oddelené čiarkou). Appka ich unesie viac naraz.

> **Prihlásenie cez Google v TWA funguje**, lebo vnútri beží skutočný
> Chrome. Neplatí to pre natívny obal (Capacitor a spol.): tam Google
> prihlásenie vo vnorenom prehliadači blokuje.

### Čo funguje bez signálu

- **Zachytenie novej úlohy** — uloží sa v telefóne a odošle sa, len čo budeš online. V rohu uvidíš, koľko vecí čaká.
- **Zobrazenie naposledy načítaných obrazoviek.**

Nefunguje offline: úprava a mazanie úloh, presúvanie v týždni. To by si vyžiadalo plný local-first prepis — vedome sme ho odložili.

---

## Lokálne s Google prihlásením

Ak chceš aj lokálne testovať skutočné prihlásenie, do `.env.local`:

```
AUTH_SECRET=vystup-z-npx-auth-secret
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_DEV_BYPASS=0
```

`DATABASE_URL` lokálne **nenastavuj** — bez neho beží vstavaný PGlite, ktorý je rýchlejší, funguje offline a nemíňa Neon.

Service worker je v dev režime zámerne vypnutý, inak by cachoval a rozbil hot reload. Otestovať sa dá len na produkčnom builde:

```bash
npm run build && npm run start
```

---

## Bezpečnostná poznámka

`ALLOWED_EMAILS` je jediná zábrana pri vstupe — prihlásiť sa smú iba e-maily z tohto zoznamu (oddeľujú sa čiarkou), ostatných Google účtov sa `signIn` callback zbaví.

**Ak ju v produkcii nenastavíš, neprihlási sa nikto.** Je to zámerne: dovtedy platil opak a zabudnutá premenná ticho otvorila appku každému, kto má Google účet. Zamknuté dvere sú menšie zlo než dokorán otvorené — keď sa nevieš prihlásiť, prvé, čo skontroluj, je práve táto premenná.

Lokálne (mimo produkcie) sa zoznam nevyžaduje, aby sa dal vývoj rozbehnúť bez `.env`.

Starý názov `ALLOWED_EMAIL` s jednou hodnotou stále funguje ako záloha, takže sa nasadenie nerozbije skôr, než premennú na Verceli premenuješ.

### Pridanie ďalšieho človeka

1. V Google Cloud Console → **OAuth consent screen → Test users** pridaj jeho gmail. Kým je appka v režime *Testing*, dnu sa dostane len ten, kto je v tomto zozname (max 100 ľudí).
2. Doplň jeho e-mail do `ALLOWED_EMAILS` na Verceli a nasaď.
3. Účet mu vznikne **až pri prvom prihlásení** — dostane vlastné id, vlastné nastavenia a päticu predvolených oblastí. Dáta sú oddelené: navzájom sa nevidíte.

> Sedemdňové vypršanie súhlasu v režime *Testing* sa týka **Google refresh tokenu**, teda kalendára — nie prihlásenia do appky. Kto kalendár nepoužíva, nič nespozoruje.

Service worker odkladá do cache aj HTML s tvojimi úlohami, aby fungoval offline. Na tvojom telefóne je to v poriadku; na cudzom zariadení sa neprihlasuj.


---

## 6. Kalendár (M8)

Kód je nasadený, ale kým nespravíš tieto tri kroky, meetingy sa nezobrazia.
Appka medzitým beží normálne — kalendár je doplnok, nie podmienka.

1. **Google Cloud Console → APIs & Services → Library** → zapni
   **Google Calendar API**.
2. **OAuth consent screen → Scopes** → pridaj
   `https://www.googleapis.com/auth/calendar.readonly`.
3. **Odhlás sa a znova prihlás.** Bez nového súhlasu Google token pre
   kalendár nevydá — a tento krok sa najľahšie zabudne.

Keď porady stále nevidno, pozri logy na Verceli. Hľadaj riadky začínajúce
`[calendar]` alebo `[google-tokens]` — obe vrstvy zlyhanie zapisujú
a nikdy ho nevyhodia na obrazovku.

**Poznámka k odhláseniu:** refresh token posiela Google iba pri PRVOM
súhlase. Keby si niekedy potreboval vynútiť nový, odober appke prístup
na [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
a prihlás sa znova.
