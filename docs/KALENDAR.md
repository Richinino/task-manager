# Google Kalendár

Appka číta udalosti z Google Kalendára **len na čítanie**. Do kalendára nič
nezapisuje ani z neho nemaže. Pripojenie je v **Nastavenia → Google
Kalendár** a postup pre vlastné nasadenie je v [NASADENIE.md](NASADENIE.md),
krok 8.

## Ktoré kalendáre

Číta sa každý kalendár, ktorý máš v Google: hlavný, rodinný, zdieľané aj
sviatky. Pri každom sú v Nastaveniach dva prepínače:

| Prepínač | Čo robí | Predvolené |
|---|---|---|
| **Ukazovať** | udalosti sú na Dnes, v Týždni, v Mesiaci a pre Clauda (MCP) | tak, ako ho máš zapnutý v Google |
| **Do času dňa** | čas jeho udalostí sa odráta z rozpočtu dňa | len hlavný kalendár |

Prečo sa do rozpočtu predvolene ráta len hlavný kalendár: rodinný či
zdieľaný kalendár býva plný cudzích termínov, ako kaderníctvo súrodenca
alebo zbor mamy, a tie nie sú tvoj čas.

Voľby sa ukladajú v `users.settings.calendarPrefs` pod id kalendára
v Google. Pole je JSONB, takže nepotrebovalo migráciu.

## Čo appka z udalosti číta

| Údaj | Kde ho vidno |
|---|---|
| názov, čas, celodenná, viacdňová | všade |
| kalendár a jeho farba | bodka pred udalosťou, detail |
| vlastná farba udalosti (kategória, napr. „Plameniaková") | bodka, detail |
| miesto | riadok pod názvom, detail |
| popis (aj z HTML, ako obyčajný text) | detail |
| druh: narodeniny, mimo kancelárie, čas na sústredenie, pracovisko, z Gmailu | riadok pod názvom |
| obsadený / voľný čas | „voľný čas" pod názvom; voľný sa do rozpočtu neráta |
| nepotvrdená (predbežná, alebo pozvánka s odpoveďou „možno" či bez odpovede) | „nepotvrdené", tlmený názov |
| kto ju pridal, keď to nie si ty | detail |
| hostia a ich odpovede, organizátor | detail |
| opakovanie | ikonka pri názve, detail |
| pripomienky (vlastné alebo predvolené kalendára) | detail |
| súkromná viditeľnosť | detail |
| odkaz do Google a na videohovor (Meet, Zoom…) | detail |

Udalosť sa neukáže, keď je zrušená alebo keď si pozvánku odmietol.

## Kde ich vidno

- **Dnes**: sekcia Kalendár. Každý riadok sa ťuknutím rozbalí do detailu.
  Celodenné udalosti sú zvlášť, lebo do rozpočtu času sa nerátajú.
- **Týždeň**: v stĺpci dňa pod udalosťami appky, s bodkou, časom a názvom.
  Rozbalením sa ukážu poznámky, popis a odkaz.
- **Mesiac**: jednodňové v bunke dňa, viacdňové ako pruh cez dni, rovnako
  ako udalosti appky. Na telefóne ich ukáže rozbalený deň pod mriežkou.
- **Claude (MCP)**: `get_day` vracia pole `calendar` a `get_upcoming` pole
  `calendarByDay`. Obe nesú všetky údaje z tabuľky vyššie.

## Rozpočet času

Do rozpočtu dňa sa ráta udalosť, ktorá spĺňa všetky tieto podmienky:

- má čas (nie je celodenná),
- je z kalendára so zapnutým „Do času dňa",
- je obsadená, teda nie je v Google označená ako „voľný",
- nie je odmietnutá,
- nie je to narodeniny ani pracovisko.

Udalosť cez polnoc zaberá z každého dňa len svoju časť.

## Technika

- Čistá logika (prevod z Google API, dni, minúty, popis z HTML) je
  v `src/lib/google-calendar.ts` a má testy.
- Sťahovanie je v `src/server/queries/calendar.ts`: najprv zoznam
  kalendárov, potom udalosti zobrazených kalendárov súbežne, za celý
  rozsah obrazovky naraz (deň, týždeň alebo mriežku mesiaca).
- Bez vyrovnávacej pamäte: kalendár sa mení počas dňa a appka ho číta
  pri každom načítaní obrazovky.
- Chyba nikdy nezhodí obrazovku, vráti sa prázdny zoznam. Dôvod je
  v logu pod `[calendar]`.
- Stačí oprávnenie `calendar.readonly`, ktoré appka pýtala už predtým.
  Netreba nový súhlas.

Zápis do Google Kalendára zatiaľ nie je. Potreboval by nový súhlas s právom
zápisu a appka stojí na tom, že kalendár je doplnok, nie podmienka.
