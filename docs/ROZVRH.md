# Školský rozvrh

Podprojekt. Zadanie a rozhodnutia z brainstormu 31. 8. 2026 — píšem ich sem,
lebo väčšina z nich nie je vidieť z kódu a bez nich sa dá ľahko „opraviť"
niečo, čo je zámer.

---

## Pravidlo, na ktorom to stojí

**Hodina sa nikdy nezapisuje ako hotová.** Je hotová vtedy, keď jej čas
prešiel — porovná sa s hodinami a nič sa neuloží.

Je to tá istá myšlienka ako pri lekcii (dokončená úloha s pilierom, žiadna
tabuľka lekcií) a pri splnenom dni návyku (zlúčenie dvoch zdrojov, žiadny
zápis navyše). Dôvod je vždy rovnaký: **čo sa nikam nekopíruje, to sa nemá
ako rozísť.** Keď si v piatok pozrieš pondelok, uvidíš ho správne, lebo sa
nič neuložilo.

**A hodina nikdy nevyrobí úlohu.** Tridsať riadkov týždenne by zabilo WIP
limit rovnako, ako by ho zabili návyky — to pravidlo je popísané
v `src/app/(app)/navyky/page.tsx` a platí aj tu.

---

## Čo sa nikdy neukladá

| údaj | ako vzniká |
|---|---|
| hodina je hotová | jej koniec už prešiel |
| ktorá hodina práve beží | porovnanie s hodinami |
| kedy je najbližšia matika | prvý budúci riadok s MAT mimo voľna |
| koľko dnes zoberie škola | súčet minút dnešných hodín |

---

## Dáta

Hodiny sa ukladajú **po jednej na dátum**, nie ako opakujúci sa vzor.
Vyzerá to plytvo (~400 riadkov za štvrťrok), ale má to jednu veľkú výhodu:
**suplovanie nie je zvláštny prípad, je to len zmenený riadok.** Žiadna druhá
tabuľka výnimiek, žiadne skladanie „vzor plus odchýlky".

| vrstva | obsah | zdroj |
|---|---|---|
| **Predmet** | skratka, celý názov, farba, poznámka | ICS + ručné doplnenie názvov |
| **Vyučujúci** | skratka, celé meno, poznámka | ICS + ručné doplnenie mien |
| **Hodina** | dátum, poradie, čas od–do, predmet, vyučujúci, učebňa, skupina, poznámka | ICS |
| **Voľno** | prázdniny, sviatky, riaditeľské voľno — rozsah dátumov | ručne |

Zvonenia **nemajú vlastnú tabuľku**: čas od–do nesie každá hodina, lebo ho
tak dodáva aj zdroj. Samostatná tabuľka by bola druhé miesto s tou istou
pravdou.

### Poznámky sú krátke

Dve úrovne a obe sú na jednu-dve vety:

- **k predmetu** — platí stále („vždy skúša z definícií")
- **ku konkrétnej hodine** — „doniesť zošit", „vrátiť test"

**Zápisky z hodiny sem nepatria.** Tie si Richard robí v RemNote a druhé
miesto na to isté by znamenalo, že ani jedno nebude úplné.

---

## Zdroj dát: EduPage

Škola `gmet.edupage.org`, odber cez **Webcal** (ICS). Overené na skutočnom
súbore z 31. 8. 2026:

**Vo feede JE:** predmet (skratka), učebňa, skupina, vyučujúci (skratka),
poradie hodiny, presný čas. 560 hodín na tri mesiace dopredu, každý deň
vypísaný zvlášť.

**Suplovanie vo feede JE** — ako šípka v `SUMMARY`:

    SUMMARY:DEJ -> SJL

znamená „namiesto dejepisu je slovenčina". Prišlo sa na to až na živých
dátach: odber z 31. 8. 2026 nemal šípku ani raz, ten z 2. 9. ju mal. Import
ju rozdelí — `subjectId` dostane nový predmet, `originalSubjectId` ten
pôvodný — takže suplovanie z EduPage tečie do appky samo, **bez hesla
a bez robota**.

Kto by šípku nerozdelil, vyrobí predmet so skratkou `DEJ -> SJL` a takých
pribudne jeden za každú novú dvojicu, kým sa zoznam predmetov nezaplní
odpadom.

**Vo feede NIE JE:**

- **prázdniny a sviatky** — dokázané: 15. 9. aj 17. 11. 2026 sú štátne
  sviatky a feed na nich má 8 hodín

Suplovanie a voľná sú teda dve rôzne veci: prvé zdroj dodáva, druhé nie.
Ručné zadanie suplovania ostáva — na riaditeľské voľno, výlety a všetko, čo
v EduPage nikdy nebude.

### Sviatky sa dajú vypočítať, prázdniny nie

**Štátne sviatky** sú v zákone a nemenia sa — appka ich vie doplniť na jedno
kliknutie vrátane Veľkej noci, ktorá sa počíta z cirkevného pravidla.

**Školské prázdniny** určuje ministerstvo, líšia sa podľa kraja a menia sa
každý rok. Tie appka hádať nebude — hádaním by tvrdila niečo, čo nevie,
a termín domácej úlohy by padol na deň, keď škola je.

Voľno **prekryje celý deň**: hodiny sa v ňom nekreslia a do rozpočtu sa
nerátajú. Ukázať ich prečiarknuté by bolo presnejšie k dátam, ale
nepresnejšie k skutočnosti — v ten deň sa nič z toho nedeje a jediné, čo
treba vedieť, je prečo.

### Feed je triedy, nie jeho

**153 okienok zo 407 má dve hodiny naraz** — deliace skupiny. Bez filtra by
mal v pondelok 11 hodín namiesto šiestich a rozpočet dňa by bol dvojnásobne
zožratý.

Richardove skupiny: **`sepB j1.sk`**, **`sepB lab 1.sk`**, **`sepB Chlapci`**
(plus `sepB` bez prívlastku, čo má celá trieda).

### Import neprepisuje ručné zmeny

Riadok, ktorého sa človek dotkol (suplovanie, poznámka), sa pri ďalšom
importe nechá tak. Inak by prvá synchronizácia zmazala každú výnimku, ktorú
si zapísal.

---

## Obrazovky

### Pruh na „Dnes"

**Umiestnenie: MEDZI prioritu dňa a naplánované na dnes.** Nie hore nad
všetkým — priorita dňa ostáva prvá vec, ktorú človek vidí.

```
ŠKOLA 8:00–14:45 · zostáva 5 h 12 min
ANJ  NEJ  CHE  CHE  DEJ  TSV
 ✓    ✓    ▶
```

Prešlé hodiny stlmené, prebiehajúca zvýraznená. **Klik na hodinu otvorí jej
detail** — ten istý, aký je na obrazovke rozvrhu.

### Mriežka rozvrhu

**Deň je RIADOK, nie stĺpec.** Pondelok jeden riadok, utorok druhý. Na
telefóne sa tak zmestí viac a dni sa čítajú zhora nadol ako všetko ostatné
v appke.

V okienku len to najnutnejšie — celé názvy sa tam nezmestia a skratky aj tak
pozná:

- **skratka predmetu** väčším
- **učebňa** menším
- **bodka**, keď na tú hodinu niečo je (poznámka, úloha alebo písomka)

Prešlé hodiny stlmené, prebiehajúca zvýraznená — to je to automatické
odškrtávanie.

### Suplovanie

**Zapisuje sa priamo do riadku hodiny.** `subjectId`, `teacherId` a `room`
vždy hovoria, čo sa v ten deň NAOZAJ deje — takže mriežka, pruh na „Dnes"
aj rozpočet ukazujú skutočnosť bez toho, aby o suplovaní čokoľvek vedeli.

Jediný stĺpec navyše je `originalSubjectId`: pamätá, čo tam malo byť, aby sa
dalo napísať „Namiesto CHE". Alternatíva — tri stĺpce `substitute_*` — by
znamenala, že každá obrazovka si musí vyberať, ktorú trojicu čítať, a jedno
zabudnuté miesto by ukazovalo rozvrh, ktorý v ten deň neplatí.

Pôvodný predmet sa zapamätá **len pri prvej zmene**. Inak by druhá oprava
toho istého dňa za pôvodný predmet vyhlásila ten suplovaný a veta „namiesto
fyziky" by zrazu tvrdila „namiesto matiky".

Zrušenie zmeny vráti predmet, ale **`manual` nechá zapnuté**: riadku sa
človek dotkol a mohol na ňom zmeniť aj poznámku — pustiť naň import by ju
zmazalo. Učebňu ani učiteľa zrušenie nevracia, tie sa obnovia zo zdroja samy.

### Detail hodiny

Otvára sa z mriežky aj z pruhu na „Dnes". Obsahuje:

- celý názov predmetu a **celé meno vyučujúceho**
- učebňa, skupina, čas
- **poznámka k tejto hodine** a **poznámka k predmetu**
- **úlohy a písomky** z tohto predmetu, najbližšia navrchu
- **„odpadla"** a **„zmena"** — ručné suplovanie na tri ťuknutia

---

## Rozpočet času

Škola zaberá deň ako porady, ale **je to vlastná kategória, nie „porady"**.
Veta musí znieť „škola 5 h 15 min" — inak by rozpočet klamal o tom, čo ten
čas zobralo.

Skutočné čísla: pondelok/streda/piatok 270 min, utorok/štvrtok 315 min.

---

## Spojenie s úlohami

Úloha dostane **predmet**. Z toho plynie zvyšok:

- **Termín sa ponúkne sám — na deň tej hodiny.** Napíšeš „domáca úloha na
  matiku", appka nájde najbližšiu hodinu MAT a dátum **predvyplní**. Je to
  ponuka, nie príkaz — dá sa prepísať.
- **Voľná sa preskakujú.** Bez toho by termín padol na deň, keď škola nie je.
- V detaile predmetu je **všetko otvorené z toho predmetu** na jednom mieste.
- **Písomka je iný druh záznamu než úloha** — ukazuje sa skôr (dva týždne
  dopredu, nie deň), lebo sa na ňu učí postupne.
