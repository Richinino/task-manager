<p align="right"><b>SK</b> · <a href="#contributing">EN</a></p>

# Prispievanie

Appka je osobný projekt, ktorý sa denne používa. Hlásenia chýb a nápady sú
vítané cez **Issues**. Pri väčšej zmene najprv otvor issue — nech sa pred
prácou vyjasní, či zapadá do návrhu v [PLAN.md](PLAN.md) (najmä sekcia
„Čo zámerne NErobíme").

## Spustenie

Potrebuješ **Node.js 24** (`.nvmrc`); s npm 10 `npm ci` padá na lockfile.

```bash
cp .env.example .env.local
npm ci
npm run db:seed
npm run dev
```

Lokálne netreba žiadny účet: databáza je vstavaný PGlite a prihlásenie
tlačidlom *Pokračovať vo vývojovom režime*. Nasadenie je v
[docs/NASADENIE.md](docs/NASADENIE.md).

## Pred každým commitom

```bash
npm run overit
```

Preklad, testy, lint, kontrola dopytov a kontrola dizajnu — zastaví sa na
prvom neúspechu. Ten istý beh (plus migrácie a build) pustí CI pri každom
pull requeste. Kroky nepúšťaj v rúre (`tsc | tail`): návratový kód by bol
z `tail` a chyba by prešla tichom.

Kontroly nechytia vizuálnu chybu — zmenu v rozhraní vždy aj naklikaj
v prehliadači, na počítači aj v úzkom okne.

## Konvencie

Záväzné sú v [docs/CONVENTIONS.md](docs/CONVENTIONS.md). To najdôležitejšie:

- **Slovenčina** v rozhraní, komentároch a dokumentácii; **angličtina**
  v názvoch premenných, funkcií a súborov. Komentár vysvetľuje *prečo*, nie
  *čo*.
- V textoch rozhrania slovenské úvodzovky „…" — stráži to
  `npm run kontrola:dizajn`.
- Každý dopyt nad tabuľkou, ktorá patrí človeku, filtruje podľa `userId` —
  stráži to `npm run kontrola:dopyty`.
- Zmena schémy = `npm run db:generate` a nová migrácia. Migrácie musia ostať
  **pridávacie** (nový stĺpec áno, zmazaný či premenovaný nie) — produkcia sa
  migruje sama pri nasadení.
- Commit: krátky slovenský nadpis, v tele čo a prečo.

## Bezpečnosť

Zraniteľnosť nehlás vo verejnom issue. Použi **Security → Report a
vulnerability**, a do žiadneho hlásenia nevkladaj tajomstvá (connection
string, kľúče, adresu odberu z EduPage).

---

# Contributing

<p align="right"><a href="#prispievanie">SK</a> · <b>EN</b></p>

This is a personal project in daily use. Bug reports and ideas are welcome as
**Issues** (English is fine). For anything bigger, open an issue first so we
can agree it fits the design in [PLAN.md](PLAN.md) — especially the list of
things the app deliberately doesn't do (section 6.7).

**Run it:** Node.js 24 (`.nvmrc`), then `cp .env.example .env.local`,
`npm ci`, `npm run db:seed`, `npm run dev`, and sign in with the development
button. No accounts needed locally (embedded PGlite). Self-hosting:
[docs/DEPLOY.md](docs/DEPLOY.md).

**Before every commit:** `npm run overit` (typecheck, tests, lint, the
per-user query check and the design check). CI runs the same plus migrations
and a production build on every pull request. UI changes also need a manual
check in the browser.

**Conventions** ([docs/CONVENTIONS.md](docs/CONVENTIONS.md), in Slovak): UI
text, comments and docs in Slovak, identifiers in English; Slovak quotes „…"
in UI strings; every query on a per-user table filters by `userId`; schema
changes go through `npm run db:generate` and migrations must stay additive.

**Security:** don't report vulnerabilities in a public issue — use
**Security → Report a vulnerability**. Never paste secrets into issues.
