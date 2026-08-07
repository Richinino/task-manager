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
4. **Environment Variables** — pridaj týchto päť:

| Premenná | Hodnota |
|---|---|
| `DATABASE_URL` | nový connection string z Neonu (po resete hesla) |
| `AUTH_SECRET` | výstup príkazu `npx auth secret` |
| `AUTH_GOOGLE_ID` | Client ID z Googlu |
| `AUTH_GOOGLE_SECRET` | Client secret z Googlu |
| `ALLOWED_EMAIL` | `richard.pastyr@gmail.com` |

> `AUTH_DEV_BYPASS` na Vercel **nepridávaj**. Aj keby si ho pridal, v produkcii je vypnutý natvrdo v kóde — ale nech tam nie je ani omylom.

5. **Deploy**.
6. Po nasadení skopíruj skutočnú adresu (napr. `task-manager-xyz.vercel.app`) a **vráť sa do Google Console** doplniť druhú redirect URI:
   `https://TVOJA-ADRESA.vercel.app/api/auth/callback/google`
7. Otvor adresu v prehliadači a prihlás sa cez Google. Ak ťa to odmietne, skontroluj `ALLOWED_EMAIL`.

---

## 4. Inštalácia na Android

PWA sa dá nainštalovať **iba z HTTPS adresy** — z localhostu to nejde. Preto až teraz.

1. Otvor adresu v **Chrome** na telefóne a prihlás sa.
2. Chrome by mal sám ponúknuť lištu *„Pridať aplikáciu na plochu"*. Ak sa neobjaví, menu **⋮ → Pridať na plochu** (v novších verziách *Inštalovať aplikáciu*).
3. Potvrď názov **Úlohy**.

Po inštalácii sa appka spustí vo vlastnom okne bez adresného riadku, s vlastnou ikonou v zozname aplikácií a vlastným záznamom v prepínači úloh. **Podržaním ikony** sa dostaneš rovno na **Dnes** alebo **Inbox**.

> Android má plnú podporu manifestu vrátane skratiek. Súbor `src/app/apple-icon.tsx` v projekte ostáva pre prípad, že by si niekedy appku otvoril na iPade alebo Macu — má 41 riadkov a nič nestojí. Pokojne ho zmaž, ak ti prekáža.

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

Systém je jednopoužívateľský a `ALLOWED_EMAIL` je jediná zábrana — prihlásiť sa smie iba tento e-mail, ostatných Google účtov sa `signIn` callback zbaví. **Ak ju v produkcii nenastavíš, dostane sa dnu ktokoľvek s Google účtom.**

Service worker odkladá do cache aj HTML s tvojimi úlohami, aby fungoval offline. Na tvojom telefóne je to v poriadku; na cudzom zariadení sa neprihlasuj.
