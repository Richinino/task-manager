# Zadanie: smer C „Jedna karta" — ďalšie obrazovky

Používateľ si vybral smer C. Teraz sa dokresľuje zvyšok appky v tom istom
jazyku. **Štýl ber doslova z `variant-c.html`** (prečítaj si ho celý):
rovnaké tokeny svetlej aj tmavej témy, Archivo (rozšírený rez 125 % na
nadpisy, 800), kopa kariet, ploché farebné plochy, akcent = čierna (v tmavej
biela), riadky zoznamu bez rámov, spodná lišta s čiernou pilulkou a „+"
v strede, stavový riadok, gesto-lišta, klávesnica. Nevymýšľaj nový štýl.

Tvar súboru je rovnaký ako v `ZADANIE-UKAZOK.md` (odkaz na písmo, `<style>`,
`.screens` so sekciami `.screen` 360 × 780, témy ako premenné na
`.screen--light` / `.screen--dark`), len obrazoviek je toľko, koľko ti
zadanie povie. Každej `.screen` daj `aria-label` s jej menom. Pravidlá zo
`ZADANIE-UKAZOK.md` platia všetky (min. 44 px ciele, žiadne „A · B · C",
žiadne „→" na tlačidlách, žiadne emoji, slovenské úvodzovky, nič nepreteká).

## Rozhodnutá štruktúra appky

**Spodná lišta:** Dnes · Plán · **+** · Inbox · Knižnica.
- **Dnes** — kopa kariet (ako vo `variant-c.html`).
- **Plán** — Týždeň, Mesiac, Udalosti, Rozvrh v jednej obrazovke s prepínačom
  navrchu (segment „Týždeň | Mesiac | Udalosti | Rozvrh").
- **+** — zachytenie.
- **Inbox** — triedenie ako kopa kariet: jedna vec naraz, pod kartou šesť
  rozhodnutí.
- **Knižnica** — rozcestník všetkého ostatného (projekty, oblasti, návyky,
  učenie, nápady, odkladiská, archív, nastavenia).

## Obsah navyše (k obsahu v `ZADANIE-UKAZOK.md`)

**Projekty:**
| projekt | oblasť | úlohy | termín |
|---|---|---|---|
| 3D tlačiareň | Učenie | 4 z 9 hotové | 15. 12. |
| Olympiáda z INF | Učenie | 1 z 4 | 20. 11., po termíne |
| Piesne na Vianoce (gitara) | Učenie | 2 z 6 | 20. 12. |
| Bicykel na jar | Domov | 0 z 3 | bez termínu |

Projekt 3D tlačiareň, definícia hotova: „Tlačiareň tlačí PETG bez
zatekania a držiak na mobil je vytlačený." Úlohy: ✓ Objednať trysku 0,4
mm; ✓ Vyrovnať podložku; ✓ Kalibrácia e-steps; ✓ Teplotná veža PETG;
Dokončiť model držiaka na 3D tlačiareň (priorita dňa, dnes, 45 min);
kúpiť filament PETG (zajtra, 30 min); Kalibrácia retrakcie (štvrtok,
40 min); Vytlačiť držiak (bez dátumu); Napísať postup do poznámok
(niekedy).

**Inbox (4):** „Kúpiť nové bežecké topánky"; „Zistiť, či sa dá PGlite
zálohovať do OneDrive"; „Fotka: zadanie z tabule FYZ" (prišla zdieľaním
z galérie, má náhľad fotky); „Návod na kalibráciu retrakcie" (prišiel
zdieľaním odkazu, doména teaching-tech.github.io). Rozhodnutia triedenia:
Dnes, Zajtra, Tento týždeň, Niekedy, Hotovo, Zahodiť. Rýchle doplnenie:
Oblasť, Projekt.

**Týždeň 23.–29. 11.** (naplánované / voľné):
po 23. 3 h 05 / 7 h (dnes) · ut 24. 1 h 40 / 4 h 20 · st 25. 2 h / 5 h,
Písomka FYZ · št 26. 45 min / 6 h · pi 27. 3 h 30 / 3 h (viac, než sa
zmestí — ukázať POKOJNE, bez červenej, napr. „o 30 min viac") · so 28.
1 h / 10 h · ne 29. 0 / 9 h, Týždenná revízia 18:00.

**Knižnica — počty:** Projekty 4 · Oblasti 5 · Návyky 3 · Učenie
4 piliere (Technika, Ruky, Hudba, Telo) · Nápady 7 · Niekedy 12 · Čaká
sa na 2 · Opakované 5 · Šablóny 3 · Archív · Nastavenia. Udalosti
a Rozvrh sú v Pláne, nie tu.

**Pravidlo z `docs/TELEFON.md`:** na prvom pohľade nikdy neukazovať nulové
série ani mínusový rozpočet ako výčitku. Preplnený deň sa povie pokojne.
