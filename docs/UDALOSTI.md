# Udalosti a deadliny

Podprojekt. Zadanie a rozhodnutia z 26. 9. 2026 — spolu s klikacím náhľadom,
ktorý Richard schválil („presne toto som chcel"). Píšem ich sem, lebo väčšina
z nich nie je vidieť z kódu a bez nich sa dá ľahko „opraviť" niečo, čo je
zámer.

---

## Prečo to nie je úloha

Písomka bola dovtedy úloha s druhom „písomka". Z toho plynuli tri chyby:

- dala sa **odškrtnúť**, hoci na nej nie je čo dokončiť,
- keď prešla, spadla do **„po termíne"** a strašila,
- zaberala miesto v zozname dňa aj vo WIP limite, hoci sa **nerobí, ale
  zažije**.

Udalosť je preto vlastná vec s vlastnou tabuľkou (`agenda_items`). Meno
tabuľky nie je `events`, lebo `task_events` je auditný log úloh a dve
„udalosti" v kóde by sa plietli pri každom čítaní.

## Dva druhy

| | **Udalosť** (`event`) | **Deadline** (`deadline`) |
|---|---|---|
| čo to je | niečo sa v danom čase **stane** a ty si pri tom | do daného momentu musí niečo **byť hotové** |
| príklady | písomka, skúšanie, lekár, výlet, koncert | odovzdať referát, prihláška, platba |
| čas | deň, voliteľne od–do; môže trvať viac dní | deň, voliteľne hodina „do" |
| uberá z času dňa | áno, keď má čas a nie je počas vyučovania | nie |
| pod sebou | prípravu (úlohy *učiť sa*, *zopakovať*) | úlohy, ktoré treba stihnúť |
| keď prejde | je prebehnutá — nič sa neodškrtáva | ukáže, či boli úlohy hotové |

**Nič sa neodškrtáva.** Rovnaké pravidlo ako pri hodine v rozvrhu: udalosť je
prebehnutá, keď jej deň prešiel. Neukladá sa to, odvodí sa to — takže sa to
nemá ako rozísť.

**Zrušená sa nemaže.** Ostane v zozname prečiarknutá, ako odpadnutá hodina.
Záznam, že sa niečo nekonalo, je informácia.

**Deadline nikdy nie je „po termíne".** Do „po termíne" padajú úlohy, ktoré
k nemu patria. Deadline sám len prejde.

## Školské typy

`exam` (písomka), `oral` (ústne skúšanie), `submit` (odovzdanie), `other`.

- **Čas z rozvrhu.** Písomka s predmetom a dňom si nájde hodinu toho
  predmetu v ten deň a vezme si jej poradie aj čas. Bez dňa dostane
  najbližšiu hodinu predmetu — tá istá ponuka, akú dostáva domáca úloha.
- **Na hodine, nie vedľa nej.** V rozvrhu aj v pruhu na „Dnes" je písomka
  vyznačená priamo v okienku hodiny. Deadline k hodine nepatrí, preto stojí
  pri dni.
- **Predvyplnený deň je len odkiaľ hľadať.** „písomka MAT" napísaná na Dnes
  v sobotu padne na pondelkovú matiku, nie na sobotu. Keď predvyplnený deň
  (Dnes, „+" na dni) hodinu toho predmetu má, písomka padne presne naň.
- **Rozpočet času ju neráta dvakrát.** Písomka počas vyučovania je už
  v „škola 4 h 30 min"; odčítať ju znova by rozpočet klamal.
- **Známka.** Po prebehnutí písomky alebo skúšania sa dá zapísať známka 1–5
  a krátka poznámka.

## Príprava

Pri zakladaní písomky appka **ponúkne** plán prípravy: 2× *učiť sa*
a 1× *zopakovať* v dňoch pred ňou (pri skúšaní 1× a 1×). Dni vyberá tak, aby
sa vyhla dňu s inou písomkou a dňu so siedmimi hodinami — keď musí posunúť,
povie prečo.

Je to **ponuka, nie príkaz**. Príprava sú obyčajné úlohy s predmetom,
druhom a väzbou na udalosť (`tasks.agenda_item_id`). Zaberajú čas dňa, dajú
sa presúvať a s pilierom sa počítajú ako lekcie. Keď sa písomka presunie,
appka ponúkne posunúť aj nehotovú prípravu o rovnaký počet dní.

## Zachytenie

**Písomka, test, previerka a skúšanie vytvoria udalosť sami.** Parser tieto
slová poznal už predtým — namiesto úlohy s druhom „písomka" teraz vznikne
udalosť. Funguje to aj z offline fronty, lebo rozhoduje server.

**Ostatné udalosti a deadliny sa volia prepínačom** v zachytení
(Úloha · Udalosť · Deadline). V náhľade vznikal deadline aj zo slova „do",
ale to by rozbilo, čo platí od M1: `do piatku`, `do 31.3.` aj `deadline 31.3.`
znamenajú **termín úlohy**. Zaplatiť nájom do piatku je úloha s termínom,
nie deadline — deadline je kotva, pod ktorou visí viac úloh. Prepínač je
preto výslovný a slová sa nemenia.

## Kde sa to ukáže

- **Dnes** — dnešné udalosti hneď pod prioritou dňa; pás „Blíži sa" na 14
  dní s odpočtom a postupom prípravy; značka na hodine v školskom pruhu.
- **Týždeň** — navrchu stĺpca dňa, oddelene od úloh a bez zaškrtávania.
- **Mesiac** — vlastné tvary: ◆ udalosť, ⚑ deadline. Trojuholník (termín
  úlohy) a krúžok (naplánované) ostávajú. Viacdňová udalosť je pás cez dni.
  **Tvar hovorí, čo to je; farba len dopĺňa** — pri deuteranopii sa to musí
  dať prečítať.
- **Rozvrh** — značka priamo na hodine, deadline pri dni, v detaile hodiny
  písomky z predmetu.
- **Udalosti** (`/udalosti`, skratka `d` z uDalosti — `u` má Učenie) —
  zoznam dopredu po týždňoch, filter Všetko / Udalosti / Deadliny / Škola,
  prebehnuté zbalené dole so známkami.

**Viacdňová udalosť, ktorá zaberá dni** (`blocks_day` — výlet, sústredenie),
vypne v tie dni rozpočet času rovnako ako celodenná úloha: „Deň zaberá
‚Výlet do Tatier‘." Aritmetika by inak hlásila preplánovaný deň, hoci je len
vyhradený.

Farba písomky je `warn` — tá istá, akou sa písomka zvýrazňovala v riadku
úlohy. Jantárová (`frog`) ostáva výhradne priorite dňa a červená (`danger`)
„po termíne".

## Presun existujúcich písomiek

Migrácia `0011` prevedie každú nezmazanú úlohu s druhom `exam` na udalosť:
dátum je termín, inak naplánovaný deň, inak deň vzniku; predmet a poznámka
idú s ňou. Pôvodná úloha sa **mäkko zmaže** (nič sa nemaže natvrdo) a do jej
histórie pribudne záznam „presunuté do udalostí". Hodnota `exam` v enume
úloh ostáva — Postgres hodnotu enumu zmazať nevie a staré riadky ju nesú —
ale v rozhraní sa už ponúkajú len tri druhy školskej práce.

## Fázy

1. **Základ** — tabuľka, migrácia, akcie, obrazovka Udalosti s detailom,
   Dnes/Týždeň/Mesiac/Rozvrh, zachytenie, známka, viacdňové udalosti.
2. **Príprava** — väzba úloh na udalosť, ponuka plánu, posun prípravy.
3. **Pripomienky** — push večer vopred / ráno / hodinu vopred, aj začiatok
   prípravy; export a vyhľadávanie.

Zápis do Google Kalendára zatiaľ nie — potreboval by nový súhlas s právom
zápisu a appka stojí na tom, že kalendár je doplnok, nie podmienka.
