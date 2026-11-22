# Zadanie pre stavbu ukážok (spoločné pre všetky smery)

Staviaš JEDEN statický HTML súbor s dvoma obrazovkami telefónu pre jeden
smer dizajnu z `SMERY.md`. Je to ukážka na porovnanie, nie appka: žiadny
React, žiadny build, najviac pár riadkov JS (radšej žiadny).

## Tvar súboru (presne takto, nič iné)

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=...&display=swap">
<style>
  /* všetko CSS tu */
</style>
<div class="screens">
  <section class="screen screen--light" aria-label="Dnes">…</section>
  <section class="screen screen--dark" aria-label="Zachytenie">…</section>
</div>
```

- BEZ `<!doctype>`, `<html>`, `<head>`, `<body>`. Súbor sa vloží do
  zdieľanej stránky cez shadow DOM — CSS sa nemusí báť kolízií, ale
  NESMIE štýlovať `html`, `body` ani `:root`. Koreň je `.screens`
  (`display:flex; gap:32px; flex-wrap:wrap; padding:24px`).
- Každá `.screen` má presne **360 × 780 px**, `overflow:hidden`,
  `position:relative`, žiadny rám telefónu (rám dorobí stránka okolo),
  `border-radius: 0`. Farby témy definuj ako vlastné premenné **na
  `.screen--light` a `.screen--dark`** (nie cez `prefers-color-scheme` —
  ukážka má témy pevné).
- Písma len z Google Fonts, vždy so záložným stackom. Ikony ako malé
  inline `<svg>` (ťahy 1.5–2 px, `currentColor`), žiadne obrázky, žiadne emoji.
- Hore stavový riadok Androidu (24 px): vľavo `9:52`, vpravo jednoduché
  ikony signálu, Wi-Fi, batérie (78 %). Dole gesto-lišta: tenká
  zaoblená čiarka 108 × 4 px, 8 px nad spodkom.
- Dotykové ciele min 44 px. Text min 12 px (výnimka: drobné štítky 11 px).
- Slovenčina s diakritikou, úvodzovky „takto". Žiadne lorem ipsum.
- Nepoužívaj: veľké písmená v štítkoch nad nadpismi (výnimka: smer A, je to
  pôvodný systém používateľa), reťazce spojené stredovou bodkou „A · B · C",
  šípku „→" na konci tlačidiel, prechody (gradienty) ako ozdobu, rovnaký
  tieň pod každou kartou.
- Všetky elementy uzavri, atribúty v dvojitých úvodzovkách. Nič nesmie
  pretekať z obrazovky ani sa prekrývať omylom — zrátaj si výšky.

## Obsah (rovnaký vo všetkých smeroch — skutočné dáta appky)

**Kedy:** pondelok 23. novembra 2026, **9:52**. Veľká prestávka po 2. hodine.

**Škola dnes** (hodiny sa po skončení odškrtávajú SAMY):
1. SJL 8:00–8:45 ✓ hotovo
2. MAT 8:55–9:40 ✓ hotovo
— prestávka do 10:00 („Teraz prestávka, o 8 min fyzika v F2")
3. FYZ 10:00–10:45, učebňa F2
4. ANJ 10:55–11:40
5. INF 11:50–12:35
6. TSV 12:45–13:30

**Udalosť dnes:** Tréning florbal 16:30–18:00, Športová hala.

**Rozpočet času** (deň 7:00–22:00): po škole a tréningu ostáva **7 h**
voľna, naplánované úlohy **3 h 05 min**, rezerva **3 h 55 min**.

**Priorita dňa (žaba, jantárová):** „Dokončiť model držiaka na 3D
tlačiareň" — projekt 3D tlačiareň, oblasť Učenie, 45 min, tlačidlo „Začať".

**Po termíne (červená):** „Odovzdať prihlášku na olympiádu z INF" — priorita
1, termín bol pred 3 dňami (piatok 20. 11.), oblasť Učenie, 15 min.

**Naplánované na dnes** (6 úloh, 1 už hotová):
| úloha | detail | oblasť | odhad |
|---|---|---|---|
| Naučiť sa na písomku z FYZ | učiť sa FYZ, písomka v stredu | Učenie | 40 min |
| Domáca úloha MAT — str. 54/3–8 | du MAT, do zajtra | Učenie | 25 min |
| Cvičiť gitaru — akordy F a Bm | ✦ lekcia Hudba, ↺ plní návyk | Učenie | 30 min |
| Zavolať do servisu kvôli bicyklu | @telefon, priorita 2 | Domov | 10 min |
| Beh 5 km | ↺ plní návyk | Zdravie | 35 min |
| ~~Zaliať kvety~~ (hotovo 7:20) | | Domov | 5 min |

Hlavička: „Dnes", „pondelok 23. novembra", počet „1 z 7 hotovo".

**Oblasti a ich farby** (bodka pri úlohe): Učenie fialová, Zdravie
smaragdová, Domov ružová, Financie jantárová (iný odtieň než žaba), Práca
indigová.

**Návyky na dnes:** Gitara 2 z 4 do týždňa; Beh 1 z 3 do týždňa; Čítanie
20 min, séria 12 dní.

**Blíži sa:** Písomka FYZ — streda 25. 11., 3. hodina.

**Navigácia dole** (5 položiek): Dnes, Týždeň, Inbox (bodka — 4
nezatriedené), Projekty, Viac.

**Zachytenie (druhá obrazovka, tmavá téma):** hárok otvorený nad
stlmenou obrazovkou Dnes. Rozpísaný text:
`kúpiť filament PETG +3D tlačiareň zajtra 30m !2`
Rozbor ukazuje: Projekt 3D tlačiareň, Plán zajtra (ut 24. 11.), Odhad
30 min, Priorita 2; názov úlohy „kúpiť filament PETG". Prepínač „Úloha /
Nápad", tlačidlo „Uložiť". Nápoveda syntaxe: `v piatok` plán, `do 31.3.`
termín, `!1` priorita, `30m` odhad, `@telefon` kontext, `#štítok`,
`+projekt`. Pod hárkom klávesnica Samsungu (stačí zjednodušená mriežka
kláves v sivých tónoch, ~260 px, s riadkom návrhov slov navrchu).

## Hotovo znamená

Súbor je uložený, HTML je validné, obe obrazovky sú 360×780 a nič z nich
nepreteká. Na konci napíš 3–5 viet: čo si spravil, čo z popisu smeru si
musel zjednodušiť. Prehliadač na kontrolu nepoužívaj — vizuálnu kontrolu
robím ja.
