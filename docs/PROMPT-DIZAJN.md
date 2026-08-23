# Prompt do Claude Design na zvyšné obrazovky

Skopíruj všetko pod čiarou do Claude Design (claude.ai/design) v tom istom
projekte, kde je `SmerB-Terminal-v2.dc.html`. Cieľ je, aby nové obrazovky
vyzerali ako pokračovanie toho istého návrhu, nie ako nové kolo.

Keď budeš mať hotovo, sprav **Handoff** a pošli mi zip — implementujem to
rovnako ako Dnes.

---

Pokračuj v projekte „Task manažér — návrhy obrazoviek", v smere
**SmerB-Terminal-v2**. Nevymýšľaj nový štýl: nové obrazovky musia vyzerať
ako ďalšie kusy toho istého návrhu.

## Čo je to za appku

Osobný task manažér pre jedného-dvoch ľudí. Klávesnica na prvom mieste,
hustý nástroj, nie marketingová stránka. Slovenské rozhranie. Používa sa
najviac na telefóne, ale rozhoduje sa pri ňom na počítači.

Vedie ma cez deň: **Dnes** je jediná vec, ktorú ráno otvorím, **Inbox** je
triedička na jedno rozhodnutie naraz, zvyšok sú odkladiská a štruktúra.

## Presné hodnoty, ktoré sa nesmú zmeniť

Sú to tokeny z `globals.css`, takže sa dajú rovno naimplementovať.

**Svetlá téma**
```
--bg #faf9f7    --surface #ffffff   --surface2 #f4f3f0
--border #e3e1dd  --borderS #cfccc6
--fg #2b2b31    --fgm #7b7a83       --fgs #a3a1a9
--acc #5b52d6   --accfg #ffffff     --accsoft #e6e4fb   --accbadge rgba(91,82,214,0.14)
--p1 #db4133    --p2 #c88431        --p3 #9a99a1
--frog #c98f20  --frogsoft #fbefd9  --frogtint rgba(201,143,32,0.14)
--danger #db4133  --dangertint rgba(219,65,51,0.10)   --succ #3f8f5f
--ar1 #5b52d6  --ar2 #2f8f6a  --ar3 #b8801f  --ar4 #c04f7a  --ar5 #7a4fd6
```

**Tmavá téma**
```
--bg #22242e    --surface #2b2d38   --surface2 #333542
--border #3d3f4d  --borderS #4f5262
--fg #eceef3    --fgm #9ea3b3       --fgs #787d8e
--acc #8b86ee   --accfg #1b1d26     --accsoft #3a3660   --accbadge rgba(139,134,238,0.22)
--p1 #f08272    --p2 #e5b072        --p3 #8d919f
--frog #e6b95f  --frogsoft #3d331c  --frogtint rgba(230,185,95,0.20)
--danger #f08272  --dangertint rgba(240,130,114,0.16)  --succ #63c68c
--ar1 #8b86ee  --ar2 #5cc396  --ar3 #dcb057  --ar4 #e88bab  --ar5 #a98cf0
```

**Písma:** IBM Plex Sans na rozhranie, JetBrains Mono na štítky, čísla, časy
a termíny. Všetko, čo sa má dať prebehnúť očami v stĺpci, je mono.

**Rozmery, ktoré už platia a musia sedieť aj inde**
```
bočný panel 220 · pravá lišta 280 · hlavička obrazovky 48
riadok úlohy 44 (počítač) / min 60 dva riadky (telefón)
pásik sekcie: padding 9/20, spodná linka, štítok mono 10px letter-spacing .14em
spodná lišta na telefóne 64 · dotykový cieľ 44
polomery 4–6 px, nie 8+ · tiene takmer žiadne
```

**Anatómia riadku úlohy je hotová a nemení sa** (je v `SmerB-Terminal-v2`,
sekcia 2d). Pevné stĺpce zľava: 18 políčko · 24 hviezda · 8 bodka priority ·
názov 1fr · podúlohy · kontext · 66 sila/termín · 80 oblasť · 44 odhad ·
24 menu. Kde je v novej obrazovke zoznam úloh, použi presne tento riadok.

## Čo navrhnúť

Ku každej obrazovke chcem **počítač 1280×800 aj telefón 375×812, v svetlej
aj tmavej** — rovnako, ako to má Dnes.

1. **Týždeň** — sedem stĺpcov, ťahanie úloh medzi dňami. Ako ukázať kapacitu
   dňa v takom úzkom stĺpci? Na telefóne to sedem stĺpcov nebude.
2. **Mesiac** — mriežka, v bunke sa nezmestí názov. Čo v nej vlastne je?
3. **Projekty** — zoznam a detail projektu s jeho úlohami, definíciou
   „hotovo" a termínom.
4. **Oblasti** — okruhy života, ktoré nikdy nekončia. Farba oblasti je to,
   čo sa objaví ako bodka pri každej úlohe.
5. **Návyky** — týždenný cieľ „X× do týždňa", séria, mriežka odškrtnutí.
6. **Opakované** — pravidlá opakovania a najbližší výskyt.
7. **Šablóny** — predpis úloh s relatívnymi dňami („+1 deň").
8. **Niekedy** a **Čaká sa na** — dve odkladiská, ten istý tvar zoznamu.
9. **Nápady** — pásma zrenia (čerstvé → zrejú → vyblednuté → vybavené),
   „iskra" 1–5, povýšenie na projekt.
10. **Archív a hľadanie** — priehradky Všetko / Hotové / Zmazané.
11. **Nastavenia** — hodiny dňa, limity, časové pásmo, miesta, pravidlá
    značkovania.

## Ako to chcem premyslené

- **Čo z obrazovky rozhoduje?** Rovnaké pravidlo ako pri riadku: nechaj v nej
  to, čo mení rozhodnutie, zvyšok daj o ťuknutie ďalej.
- **Prázdny stav** je pri odkladiskách bežnejší než plný — navrhni ho.
- **Klávesnica**: každá obrazovka má skratku (`t w m i p o v b s c a h`) a na
  zozname sa treba dať pohybovať bez myši. Ukáž, kde to je vidieť.
- **Telefón nie je zúžený počítač.** Kde stĺpce nedávajú zmysel, sprav dva
  riadky textu — ako pri riadku úlohy.

Ak ti niečo z appky nie je jasné, radšej sa opýtaj, než by si to domyslel.
