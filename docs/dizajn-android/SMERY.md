# Telefón (Android) — štyri smery dizajnu

Appka beží na Samsungu ako TWA (Chrome vo vnútri `.apk`), takže všetko, čo
sa tu navrhne, sa postaví v tom istom Next.js kóde — iba pre šírku telefónu.
Plátno ukážok je 360 × 780 CSS px (Galaxy S v dp).

Spoločné pre všetky smery, aby sa dali porovnať:

- **Jantárová = priorita dňa (žaba), červená = po termíne.** Ten význam
  prežije každý smer, mení sa len odtieň.
- Obsah je skutočný: pondelok 23. novembra 2026, **9:52**, prestávka po
  2. hodine. Prvé dve hodiny sú už odškrtnuté samy, ďalej je fyzika o 10:00.
- Dve obrazovky na smer: **Dnes** (svetlá téma) a **Zachytenie** otvorené
  nad Dnes (tmavá téma) — aby bolo vidieť obe témy.

---

## A — Terminál do ruky

**Myšlienka:** súčasný „Terminál" ostáva na chlp rovnaký (tokeny, IBM Plex
Sans + JetBrains Mono, polomery 4–6 px, pruhy oddelené linkami). Mení sa len
ergonómia palca.

- Plávajúce tlačidlo zmizne. Nad spodnou lištou je natrvalo **príkazový
  riadok** `› Zachytiť…` v mono — to, čo na počítači robí klávesnica, robí
  na telefóne tento riadok.
- Rozpočet dňa je **jednoriadkové pravítko** `07 ─────●───── 22` s hodinovými
  ryskami: vyplnené bloky = škola a porady, bodka = teraz, číslo vpravo =
  voľné minúty.
- Riadok úlohy dvojriadkový (min 60 px). Jeden riadok je zachytený uprostred
  potiahnutia doprava a odhaľuje zelené „Hotovo" — ukážka gesta.
- Zachytenie: hárok vyrastie z príkazového riadku, rozbor sa ukazuje ako
  zvýraznenie syntaxe priamo v texte a pod ním mono riadky `projekt → …`.

**Získaš:** nič sa nemusí prekresliť, len doladiť. **Stratíš:** nič nové,
telefón bude stále „menší počítač s lepším palcom".

## B — Pravítko dňa

**Myšlienka:** na telefóne sa nerozhoduje „čo spravím", ale „zmestí sa to".
Preto je Dnes **zvislá časová os**: výška = čas, od 7:00 po 22:00.

- Vľavo úzka koľaj školy — hodiny ako bloky, ktoré sa po skončení samy
  prečiarknu a stlmia. Čiara **teraz** ide naprieč celou obrazovkou.
- Úlohy s odhadom sú bloky položené do voľných medzier. Čo sa nezmestí
  alebo nemá odhad, čaká v **podnose** dole: „Bez času · 3 úlohy · 1 h 10 min".
- Rozpočet nie je číslo, je to **prázdne miesto** na osi.
- Zachytenie: kým píšeš „zajtra 30m", pod poľom sa ukáže zajtrajšia os
  s priesvitným blokom tam, kde sa úloha zmestí.

Paleta studená sivá + kobalt, písmo Schibsted Grotesk, časy Martian Mono.

**Získaš:** odpoveď na „stihnem to?" jedným pohľadom. **Stratíš:** hustotu —
dlhý zoznam bez odhadov sa do osi nezmestí, žije v podnose.

## C — Jedna karta

**Myšlienka:** telefón odpovedá na jedinú otázku „čo robím ďalej?". Appka už
má „Čo teraz?" — tu sa z neho stáva celá obrazovka Dnes. (Pôvodný smer
„Zošit" používateľ zamietol.)

- Navrchu pilulka **teraz**: „Prestávka, o 8 min FYZ v F2".
- Hlavná je **kopa kariet**: navrchu veľká karta celá v jantárovej (priorita
  dňa), za ňou vytŕčajú ďalšie úlohy vo farbe svojej oblasti. Potiahnutie =
  ďalšia, „Začať" = idem na to.
- Pod kopou krátky zoznam „Potom" po jednom riadku.
- Zachytenie je celá obrazovka, nie hárok: veľký text a pod ním náhľad
  karty, ktorá z neho vznikne.

Písmo Archivo (rozšírený rez na nadpisy), paleta ploché farebné plochy,
akcent je čierna.

**Získaš:** najmenej rozhodovania. **Stratíš:** prehľad celého dňa naraz.

## D — One UI: pozri hore, ťukni dole

**Myšlienka:** appka, ktorá vyzerá, akoby ju dodal Samsung. Horná tretina sa
len číta, všetko, čo sa ťuká, je v dosahu palca.

- Hore veľká veta s obrovským číslom: „Do 22:00 máš voľné **3 h 10 min**".
  Pri rolovaní sa zbalí do hlavičky (ako nastavenia v One UI).
- Obsah v zoskupených zoznamoch so zaoblením 26 px (jedna skupina = jeden
  kontajner, riadky delené odsadenou linkou), čipy ako pilulky.
- Tónová paleta odvodená od tvojej indigovej `#5b52d6`, žiadne prechody.
- Dole navigácia Material 3 s pilulkou a veľké tlačidlo „Zachytiť".
- Zachytenie: spodný hárok s úchytom, rozbor ako ťukateľné čipy
  (Projekt · Zajtra · 30 min · P2).

Písmo Roboto Flex (úzka šírka na veľké číslo).

**Získaš:** pocit natívnej appky, najľahšie ovládanie jednou rukou.
**Stratíš:** vlastnú identitu — bude vyzerať ako ďalšia appka v telefóne.
