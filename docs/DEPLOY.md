# Self-hosting guide

How to run your own copy of the app on free tiers: **GitHub** (code),
**Neon** (Postgres), **Google** (sign-in), **Vercel** (hosting) and
**cron-job.org** (reminders). Total cost: **€0/month**.

The Slovak guide [NASADENIE.md](NASADENIE.md) covers the same steps in more
detail, including troubleshooting. The app's UI is Slovak only.

**What you're deploying:** a personal app for one person, or a few people who
each see only their own data. Who can sign in is decided by an email allowlist
(`ALLOWED_EMAILS`) — there is no public sign-up.

## Prerequisites

- A GitHub account (to fork the repo)
- A Google account (for Google Cloud Console and to sign in)
- Free accounts on [Vercel](https://vercel.com), [Neon](https://neon.tech) and
  [cron-job.org](https://cron-job.org)
- **Node.js 24** locally (pinned in `.nvmrc`) — only needed to generate keys
  and for local development. With Node 22 / npm 10, `npm ci` fails with
  "lock file not in sync" because the lockfile comes from npm 11.

**The order matters:** Vercel deploys whatever is in your GitHub repo, and
Google needs your app's URL, which Vercel only assigns on the first deploy.

```
fork → Neon → Google OAuth → Vercel → URL back to Google → reminders → phone
```

## 1. Fork the repository

Fork it on GitHub. Vercel deploys from your fork; every push to `main` is a
new deploy. Pull upstream changes later with **Sync fork**.

GitHub doesn't run workflows in a fork until you enable them in the
**Actions** tab:

- **Kontrola** (CI: typecheck, tests, lint, migrations on a clean Postgres,
  build) — recommended, needs no secrets.
- **Pripomienky** and **Rozvrh** — an optional *backup* scheduler (step 6).
  Their scheduled runs start only once you set the repository variable
  `ZALOZNY_PLANOVAC` to `1`; until then they're skipped, so enabling them
  does no harm.

## 2. Database — Neon

1. Create a Neon project. Pick a region close to you and use the same region
   for Vercel Functions later (e.g. AWS Frankfurt `eu-central-1` + Vercel
   `fra1`) — every query travels between the two.
2. **Connect** → copy the connection string. Use the **direct** connection
   (no `-pooler` in the hostname): the deploy-time migration guards against
   concurrent builds with a session-level advisory lock, which a
   transaction-mode pooler doesn't hold reliably. A single-user app gains
   nothing from pooling anyway.

You don't need to create the schema — the first production deploy on Vercel
runs all migrations (see [Updates and migrations](#updates-and-migrations)).

Treat the connection string as a password. If it ever leaks, reset the role's
password in Neon (**Roles → Reset password**); schema and data are kept.

Any Postgres works instead of Neon, but outside `localhost` the app always
connects over TLS with certificate verification.

## 3. Google OAuth

1. [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
   create a project.
2. **OAuth consent screen** (*Google Auth Platform* in the newer console):
   *External*, publishing status *Testing*, and add your Gmail under
   **Test users**. In *Testing* mode only listed test users (max 100) can
   sign in.
3. **Create credentials → OAuth client ID → Web application.**
4. **Authorized redirect URIs:** for now only
   `http://localhost:3000/api/auth/callback/google`. You'll add the Vercel URL
   in step 4.
5. Copy the *Client ID* and *Client secret*.

Sign-in only asks for identity. Calendar access is optional (step 8).

## 4. Vercel

1. **Add New → Project** → import your fork. The framework is detected as
   Next.js; **don't change** the build or output settings — `npm run build`
   migrates the database before building.
2. Add these environment variables for **Production**:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon connection string |
   | `AUTH_SECRET` | output of `npx auth secret` |
   | `AUTH_GOOGLE_ID` | Google Client ID |
   | `AUTH_GOOGLE_SECRET` | Google Client secret |
   | `ALLOWED_EMAILS` | your Gmail; separate several with commas |

   Never add `AUTH_DEV_BYPASS` (it's hard-disabled in production anyway).
   **If `ALLOWED_EMAILS` is empty, nobody can sign in in production** — this
   is deliberate (fail-closed).
3. **Deploy.** The build log should show the migrations running
   ("Púšťam migrácie").
4. Copy the **stable** domain from the project's *Domains*
   (`your-project.vercel.app`), then:
   - add `https://YOUR-DOMAIN/api/auth/callback/google` to the Google redirect
     URIs,
   - add `AUTH_URL` = `https://YOUR-DOMAIN` (no trailing slash) on Vercel,
   - **Settings → Build and Deployment → Node.js Version: 24.x** (same as CI
     and `.nvmrc`),
   - **Settings → Functions → Region:** close to your Neon region,
   - **Redeploy** — Vercel only injects environment variables when a
     deployment is created, so every variable change needs a redeploy.
5. Open the stable domain and sign in with Google. Your account (with five
   default areas) is created on first sign-in.

Why `AUTH_URL` matters: every Vercel deployment also gets a one-off URL (the
**Visit** button uses it). Without `AUTH_URL` the OAuth callback would be
built from that URL, which Google doesn't know → `Error 400:
redirect_uri_mismatch`.

## 5. VAPID keys (push notifications)

Until these are set, the app doesn't offer notifications at all.

```bash
npx web-push generate-vapid-keys
```

Add on Vercel (Production), then redeploy:

| Variable | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | the public key |
| `VAPID_PRIVATE_KEY` | the private key |
| `VAPID_SUBJECT` | optional contact, e.g. `mailto:you@example.com` (defaults to `AUTH_URL`) |
| `CRON_SECRET` | a long random secret, e.g. another `npx auth secret` |

**Generate the VAPID keys once and never change them** — changing them
invalidates every existing push subscription.

`CRON_SECRET` is the only thing protecting `/api/pripomienky` and
`/api/rozvrh`. While it's unset, both return 401 to everyone (fail-closed).

## 6. Scheduler — cron-job.org

Web Push has to be sent from the server, and Vercel Hobby cron runs only once
a day. An external cron calls the app instead. GitHub Actions' schedule was
tried first and proved unreliable (median gap 39 min, worst 11.6 h, measured
over 68 runs), and reminders older than 6 hours are dropped — so
cron-job.org is the primary scheduler.

Create a cron job on [cron-job.org](https://cron-job.org) (the second one
only if you use the school timetable, step 7):

| | Reminders | Timetable *(optional)* |
|---|---|---|
| URL | `https://YOUR-DOMAIN/api/pripomienky` | `https://YOUR-DOMAIN/api/rozvrh` |
| Schedule | every 5 minutes | hourly, 6:00–20:00, Mon–Fri |
| Method | `POST` | `POST` |
| Header | `Authorization: Bearer <CRON_SECRET>` | `Authorization: Bearer <CRON_SECRET>` |
| Timeout | 30 s | 30 s |

Set the job's time zone to yours. A healthy run returns `200` with
`"ok":true`; `401` = secret mismatch, `503` = VAPID keys (or `SKOLA_ICS_URL`)
missing.

Then, in the app: **Nastavenia → Pripomienky → Zapnúť pripomienky v tomto
prehliadači** (Settings → Reminders → enable in this browser). Only tasks with
a **time** (not just a day) and events with a reminder turned on trigger
notifications.

**Optional backup via GitHub Actions:** add repository secrets
`PRIPOMIENKY_URL` (`https://YOUR-DOMAIN/api/pripomienky`), `ROZVRH_URL`
(`https://YOUR-DOMAIN/api/rozvrh`) and `CRON_SECRET` (same value as on
Vercel), set the repository **variable** `ZALOZNY_PLANOVAC` to `1`, then
enable the workflows. Without the variable the scheduled runs are skipped, so
a fresh copy doesn't email you a failure every 15 minutes; a manual *Run
workflow* runs regardless. Running both schedulers can't send a
reminder twice — a unique index stops the second attempt. Note that GitHub
disables scheduled workflows in *public* repos after 60 days without
activity.

To test by hand:

```bash
curl -s -X POST "https://YOUR-DOMAIN/api/pripomienky" \
  -H "Authorization: Bearer <CRON_SECRET>" -H "Content-Length: 0"
```

## 7. Optional: school timetable (EduPage)

Built for Slovak schools on EduPage. In EduPage enable **Webcal** in your
profile and set its URL as `SKOLA_ICS_URL` on Vercel (a `webcal://` URL is
fine). It's a secret — anyone with it can see your timetable; the app never
exposes it.

- Do the **first import manually** on the *Rozvrh* screen and pick your class
  groups; the cron only refreshes the timetable for a user who already has
  one. Manual import also works without `SKOLA_ICS_URL` (upload an `.ics`
  file).
- There is one feed URL per deployment, so automatic sync is single-user; with
  more than one timetable user the endpoint answers `409` and does nothing.
- Holidays aren't in the feed; public holidays can be added in one click,
  school holidays are entered manually.

## 8. Optional: Google Calendar (read-only)

1. Google Cloud Console → **APIs & Services → Library** → enable **Google
   Calendar API**.
2. Consent screen → **Scopes** (*Data Access*) → add
   `https://www.googleapis.com/auth/calendar.readonly`.
3. In the app: **Nastavenia → Google Kalendár → Prepojiť kalendár**.

While the Google app is in *Testing*, calendar consent expires after 7 days;
reconnect from the same card. (Publishing the app with a calendar scope means
either Google verification or an "unverified app" warning.)

## 9. Install on your phone

Open the stable domain in **Chrome on Android** → *Install app* / *Add to
Home screen*. On iPhone: Safari → Share → *Add to Home Screen*; iOS only
allows web push for installed web apps (iOS 16.4+). The app is developed and
used on Android; iOS is untested.

An optional Android `.apk` (Trusted Web Activity) is supported via
`ANDROID_PACKAGE_NAME` and `ANDROID_CERT_FINGERPRINTS`, which make the app
serve `/.well-known/assetlinks.json` — see section 6 of
[NASADENIE.md](NASADENIE.md).

## 10. Optional: Claude (MCP)

Nothing to configure — the app is its own OAuth server. In Claude open
**Settings → Connectors → Add custom connector**, paste
`https://YOUR-DOMAIN/api/mcp`, sign in and click **Povoliť** (allow). The URL
is also shown in the app under Nastavenia → Pripojené aplikácie. Tools and
design notes: [docs/MCP.md](MCP.md) (Slovak).

## Adding another person

1. Add their Gmail to **Test users** in Google Cloud Console.
2. Add it to `ALLOWED_EMAILS` on Vercel and redeploy.
3. Their account is created on first sign-in; data is fully separated.

## Updates and migrations

Pull updates with **Sync fork** (or push). On every **production** deploy on
Vercel, `npm run build` first applies pending migrations, then a migration
check verifies the database matches the repo; if it doesn't, the deploy fails
and Vercel keeps the last working version. A failed build isn't retried —
fix the cause and **Redeploy**.

Migrations are skipped on preview builds, local builds and without
`DATABASE_URL`. **On hosts other than Vercel** set `MIGROVAT_PRI_BUILDE=1`
for the build (or run `npm run db:migrate` beforehand), otherwise the check
stops the build. Escape hatches: `SKIP_MIGRATION=1`, `SKIP_MIGRATION_CHECK=1`.

All environment variables, with comments, are listed in
[`.env.example`](../.env.example).

## Local development with Google sign-in

Locally you don't need Google at all — `AUTH_DEV_BYPASS=1` from
`.env.example` enables a development sign-in button. To test real Google
sign-in locally, set in `.env.local`:

```
AUTH_SECRET=<output of npx auth secret>
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_DEV_BYPASS=0
```

and keep `http://localhost:3000/api/auth/callback/google` among the redirect
URIs (step 3). Leave `DATABASE_URL` empty locally — the embedded PGlite is
faster, works offline and doesn't touch production. The service worker is off
in dev mode; test it with `npm run build && npm run start`.

## Costs

Everything fits the free tiers: Vercel Hobby, Neon Free, cron-job.org and
Google Cloud (OAuth and the Calendar API are free). GitHub Actions minutes are
free for public repositories (a fork of a public repo is public). In a
*private* copy every backup-scheduler run is billed as at least one minute of
the 2,000 free minutes per month — leave those workflows disabled there.
