# Nasadenie

Kroky, ktoré musíš spraviť ty — vyžadujú prihlásenie do tvojich účtov. Cena celého setupu je **0 €**.

Kým ich neurobíš, appka beží lokálne s vývojovým prihlásením a vstavanou databázou. Nič ti to neblokuje.

---

## 1. Databáza — Neon

1. Vytvor si účet na [neon.tech](https://neon.tech) (free tier).
2. Založ projekt, napr. `task-manazer`, región **Frankfurt** (najbližší).
3. Skopíruj *connection string* — má tvar `postgresql://user:heslo@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.

Aplikuj schému:

```bash
DATABASE_URL="sem-vloz-connection-string" npm run db:migrate
```

Naplnenie základnými oblasťami:

```bash
DATABASE_URL="sem-vloz-connection-string" npm run db:seed
```

---

## 2. Google OAuth

1. Otvor [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Vytvor projekt (napr. `task-manazer`).
3. **OAuth consent screen** → typ *External*, User type stačí *Testing*, pridaj svoj e-mail medzi testovacích používateľov.
4. Pridaj scope `https://www.googleapis.com/auth/calendar.readonly` — bude potrebný v M8 na čítanie kalendára.
5. **Create credentials → OAuth client ID → Web application**.
6. Authorized redirect URIs — pridaj obe:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://TVOJA-DOMENA.vercel.app/api/auth/callback/google`
7. Skopíruj *Client ID* a *Client secret*.

---

## 3. Vercel

1. Nahraj projekt na GitHub (súkromný repozitár).
2. Na [vercel.com](https://vercel.com) → **Add New → Project** → vyber repozitár.
3. Framework sa rozpozná automaticky (Next.js). Nič nemeň.
4. **Environment Variables** — pridaj:

| Premenná | Hodnota |
|---|---|
| `DATABASE_URL` | connection string z Neonu |
| `AUTH_SECRET` | výstup príkazu `npx auth secret` |
| `AUTH_GOOGLE_ID` | Client ID z Googlu |
| `AUTH_GOOGLE_SECRET` | Client secret z Googlu |
| `ALLOWED_EMAIL` | `richard.pastyr@gmail.com` |

> `AUTH_DEV_BYPASS` na Vercel **nepridávaj**. Aj keby si ho pridal, v produkcii je vypnutý natvrdo v kóde.

5. **Deploy**.
6. Po nasadení doplň skutočnú doménu do Authorized redirect URIs v Google Console (krok 2.6).

---

## 4. Inštalácia na telefón

Po M2 (PWA) otvoríš adresu vo Chrome na mobile → menu → **Pridať na plochu**. Appka sa bude správať ako natívna, vrátane offline režimu.

---

## Lokálne s Google prihlásením

Ak chceš aj lokálne testovať skutočné prihlásenie, do `.env.local` doplň:

```
AUTH_SECRET=vystup-z-npx-auth-secret
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_DEV_BYPASS=0
```

---

## Bezpečnostná poznámka

Systém je jednopoužívateľský. `ALLOWED_EMAIL` je jediná zábrana — prihlásiť sa smie iba tento e-mail, ostatných Google účtov sa `signIn` callback zbaví. Ak premennú nenastavíš, dnu sa dostane ktokoľvek s Google účtom. **Nenechávaj ju prázdnu v produkcii.**
