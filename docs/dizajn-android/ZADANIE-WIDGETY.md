# Zadanie: návrhy widgetov na plochu Samsungu

Používateľ: súčasný widget je „dosť wack". Chce sadu widgetov, ktoré **pekne
sedia na ploche**, v **rôznych veľkostiach** a s **rôznym zameraním**, aby si
vybral. Jazyk je smer C „Jedna karta" (`variant-c.html`, `c-*.html`): ploché
farebné plochy, Archivo (rozšírený rez 125 %, 800 na nadpisy), akcent čierna,
jantárová = priorita dňa (žaba), farby oblastí. Žiadne gradienty, žiadne tiene
okrem jemného tieňa widgetu na tapete.

## Mriežka plochy (One UI, telefón 360 px)

4 stĺpce, bunka ~82 px, okraje 16 px. Vonkajšie rozmery widgetov:
1×1 = 70×70 · 2×1 = 156×70 · 2×2 = 156×156 · 4×1 = 328×70 ·
4×2 = 328×156 · 4×3 = 328×242 · 4×4 = 328×328. Medzera medzi widgetmi 12 px.
Polomer widgetu 26 px (One UI), vnútorné prvky menej (16 / 12 / pilulky).

## Obsah (rovnaký ako v ukážkach, pondelok 23. 11., 9:52)

Priorita dňa: „Dokončiť model držiaka na 3D tlačiareň", 45 min, projekt 3D
tlačiareň. Úlohy: Naučiť sa na písomku z FYZ (40 min, Učenie fialová),
Domáca úloha MAT — str. 54/3–8 (25 min, Učenie), Cvičiť gitaru — akordy F a
Bm (30 min, Učenie), Zavolať do servisu kvôli bicyklu (10 min, Domov ružová),
Beh 5 km (35 min, Zdravie zelená). Po termíne: Odovzdať prihlášku na
olympiádu z INF (pred 3 dňami). Škola: SJL ✓, MAT ✓, prestávka, FYZ 10:00 F2,
ANJ 10:55, INF 11:50, TSV 12:45–13:30. Tréning florbal 16:30–18:00. Rezerva
3 h 55 min, úlohy 3 h 05. Týždeň po–ne: 3 h 05 z 7 h (dnes), 1 h 40 z 4 h 20,
2 h z 5 h (písomka FYZ), 45 min z 6 h, 3 h 30 z 3 h (preplnené — pokojne),
1 h z 10 h, 0 z 9 h. Inbox 4.

## Widgety (každý: svetlá aj tmavá verzia)

1. **Žaba 2×2.** Celý widget je jantárová plocha (#d9971c, text #1d1405).
   Hore malá hviezda + „Priorita dňa". Názov úlohy Archivo rozšírený 800
   ~17 px, max 3 riadky. Dole „45 min" vľavo a vpravo 40 px kruh s fajkou
   (odškrtnúť). Zameranie: jedna vec, ktorú dnes spravíš ako prvú.
   Keď je hotová: plocha zmení farbu na ďalšiu úlohu (ukáž aj tento stav
   malý vedľa — „Hotovo. Ďalšia: Naučiť sa na písomku z FYZ" vo fialovej).
2. **Teraz 4×1.** Tenký pás pod hodiny. Vľavo jantárová bodka a dva riadky:
   „Prestávka" (600) / „o 8 min FYZ v F2" (fg-muted). Vpravo pilulka s
   ďalšou úlohou po škole skrátená a 44 px čierny kruh „+". Zameranie: čo
   je práve teraz a čo príde. Ukáž aj stav po škole: „Po škole · voľno do
   16:30" / „Ďalej: Dokončiť model…".
3. **Pravítko 4×2.** Hore „Dnes" + „Rezerva 3 h 55" (zelená). Stred:
   vodorovné pravítko dňa 7–22 (28 px vysoké, zaoblené): sivé bloky školy,
   obrys florbalu, farebné bloky úloh, jantárový blok žaby, čiara teraz s
   „9:52", minulosť stlmená; pod ním hodiny 7 10 13 16 19 22. Dole dva čipy
   najbližších úloh s farebnou bodkou. Zameranie: „stihnem to?".
   (V Androide sa pravítko vykreslí ako obrázok — je to uskutočniteľné.)
4. **Zoznam 4×3 a 4×4.** Prepracovaný súčasný widget: hlavička „Dnes" +
   „1 z 7 hotovo" + malé ↻; jantárový blok žaby (zaoblený 16, s kruhom
   na odškrtnutie); pod ním riadky 40 px: kruh 22 px (obrys), názov, vpravo
   odhad a farebný štvorček oblasti 8 px; riadok po termíne červeným textom.
   Dole pilulka „Zapísať úlohu" (čierna) a kruh s mikrofónom. 4×4 ukáže 5
   riadkov a dá sa v ňom rolovať.
5. **Kopa 2×2 / 4×2.** Karta ako v appke: vrchná úloha v plnej farbe
   oblasti, za ňou vykúkajú 2 ďalšie (posunuté o 6 a 12 px dole, užšie).
   Na karte „1 z 6", názov, odhad, dva kruhy: fajka (hotovo) a šípka
   (ďalšia). Zameranie: jedna úloha naraz, ako obrazovka Dnes.
6. **Škola 2×2.** Pre študenta: veľká skratka ďalšej hodiny „FYZ"
   Archivo 800 ~44 px vo farbe predmetu, pod ňou „10:00 · F2" — nie, bez
   stredových bodiek: „10:00 v F2"; dole rad 6 malých bodiek (hodiny dňa,
   odškrtnuté plné, aktuálna obrys); po škole: „Škola skončila" + „Zajtra
   prvá SJL o 8:00". Ukáž aj deň s písomkou: malá červeno-ružová pilulka
   „písomka".
7. **Týždeň 4×2.** Sedem stĺpcov (po–ne): skratka dňa, číslo, zvislý pás
   kapacity (výška ~70 px, naplnená časť čierna pre dnes, fg-muted ostatné,
   zvyšok surface-2), pri st malá ikonka písomky, pi naplnený celý bez
   červenej. Hore „Týždeň 23.–29. 11." a vpravo „12 h naplánované".
8. **Zapísať 1×1 a 2×1.** 1×1: čierny zaoblený štvorec s veľkým „+".
   2×1: čierna pilulka „+ Zapísať" a vedľa kruh s mikrofónom. Pre hlas.
9. **Rezerva 2×1 (bonus).** Veľké číslo „3 h 55" Archivo rozšírený 800
   ~28 px + „rezerva dnes" malé; pod ním tenký pás kapacity. Ak preplnené:
   „o 30 min viac" pokojne.

## Stránka (artefakt)

Názov stránky „Widgety na plochu". Krátky úvod (2 vety). Potom:
A) **Tri ukážky plochy** v telefónoch 360×780 (rám ako v predchádzajúcich
   artefaktoch: zaoblený 34 px, tmavý okraj), každá s inou tapetou a inou
   kombináciou — „Študent" (Teraz 4×1 + Škola 2×2 + Žaba 2×2 + Zapísať
   2×1 + rad ikon), „Plánovač" (Pravítko 4×2 + Týždeň 4×2 + Zapísať 1×1),
   „Minimal" (Kopa 2×2 + Rezerva 2×1 + Zapísať 2×1 + hodiny One UI).
   Tapety ploché farby: šalviová #c9d3cc, tmavá bridlica #2b303b, piesková
   #e6dccf. Na tmavej tapete sú widgety v tmavej verzii. Hore stavový riadok,
   veľké hodiny One UI „9:52" a dátum, dole dok so 4 ikonami (generické
   farebné štvorce bez značiek) a gesto-lišta.
B) **Katalóg**: každý widget samostatne v skutočnej veľkosti na sivom poli,
   svetlá a tmavá vedľa seba, pod tým názov, veľkosť (napr. „2×2"), jedna
   veta na čo je, a jedna veta „Ako sa postaví" (čo zvládne Android widget:
   pravítko ako obrázok, rolovanie v 4×4 cez zoznam, Archivo cez písmo
   v appke od Androidu 8).
C) Na konci: „Ako vybrať" — napíš mi čísla widgetov, ktoré chceš (napr.
   „1, 3, 4 a 8"), postavím ich naraz.

Pravidlá stránky: platí `ZADANIE-UKAZOK.md` (úvodzovky „", bez emoji, bez
„A · B · C", bez kapitálok v štítkoch, bez gradientov), stránka sama tichá
(IBM Plex Sans na texty stránky ako predtým), svetlá aj tmavá téma stránky
cez `prefers-color-scheme` a `[data-theme]`, mobilná šírka bez vodorovného
rolovania (telefóny sa na úzkej obrazovke zmenšia cez `zoom`).
