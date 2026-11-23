# Stavba: widgety Pravítko 4×2 a Zapísať 1×1 (Android 1.4)

Vzhľad presne podľa `widgety.html` (widget 3 „Pravítko" a 8 „Zapísať"
v 1×1). Ostatné widgety z návrhu sa teraz NEROBIA.

## Farby podľa Samsungu

Na Androide 12+ widgety berú farby z palety systému (One UI „Farebná paleta"
odvodená z tapety), na starších aspoň svetlú/tmavú podľa systému.

| zdroj | svetlá `values-v31` | tmavá `values-night-v31` | starší Android svetlá / tmavá |
|---|---|---|---|
| `w_bg` plocha widgetu | `@android:color/system_neutral1_50` | `system_neutral1_900` | #f7f7f9 / #1a1a21 |
| `w_fg` text | `system_neutral1_900` | `system_neutral1_50` | #141419 / #f2f2f6 |
| `w_muted` vedľajší text | `system_neutral2_600` | `system_neutral2_300` | #55555f / #a9a9b6 |
| `w_track` stopa pravítka | `system_neutral2_100` | `system_neutral2_800` | #ececf1 / #24242d |
| `w_school` bloky školy | `system_neutral2_300` | `system_neutral2_600` | #cfcfd8 / #3a3a45 |
| `w_accent` „+", čiara teraz | `system_accent1_700` | `system_accent1_200` | #141419 / #f2f2f6 |
| `w_on_accent` | `system_accent1_0` | `system_accent1_900` | #ffffff / #141419 |
| `w_ok` rezerva | `#1f8a5f` | `#4cc38d` | rovnako |

Nemenia sa (nesú význam): priorita dňa `#d9971c`, farby oblastí z API.

## Pravítko 4×2

```
┌──────────────────────────────────────┐
│ Dnes                  Rezerva 3 h 55 │   ← w_fg 15sp 700 · w_ok 13sp 600
│ ▒▒▒▒▒▒▒░░░░▓▓▓█▌░░[ ]▓░░░░░░░░░░░░   │   ← pravítko 28dp, obrázok
│ 7    10    13    16    19    22      │   ← w_muted 11sp
│ (● Dokončiť model…) (● Naučiť sa na…)│   ← 2 pilulky w_track 32dp
└──────────────────────────────────────┘
```
- Pravítko sa kreslí v kóde ako `Bitmap` (Canvas) v šírke widgetu
  (`AppWidgetManager.getAppWidgetOptions` → `OPTION_APPWIDGET_MIN_WIDTH/MAX_WIDTH`,
  prevod dp→px, rozumná záloha 320 dp). Zaoblená stopa `w_track`, minulosť
  (od začiatku po teraz) prekrytá `w_bg` s alfou 0.55, škola `w_school`,
  porady/udalosti obrys 2 dp `w_fg`, úlohy plná farba oblasti (bez farby
  `w_accent`), žaba jantárová, čiara teraz 2 dp `w_accent` s malou
  pilulkou času nad ňou („9:52"). Bloky zaoblené 4 dp.
- Ťuknutie na pravítko otvorí `/dnes` (pohľad Deň — appka si pamätá
  posledný pohľad); ťuknutie na pilulku úlohy otvorí `/dnes`.
- Bez spojenia: posledné uložené dáta + vpravo hore „bez spojenia".
  Bez pripojenia widgetu: „Pripoj widget v appke: Knižnica → Nastavenia → Telefón".
- Po konci dňa: pravítko celé stlmené, vpravo „Deň sa skončil".
- Farby čítané cez `context.getColor(...)` pri každom kreslení; prekreslí sa
  pri každom obnovení a v `onAppWidgetOptionsChanged` (zmena veľkosti).
  Pri zmene témy systému sa obnoví pri najbližšom obnovení — stopa a škola
  sú dosť neutrálne, aby medzitým nevyzerali zle.
- Veľkosť: predvolene 4×2 (`targetCellWidth 4`, `targetCellHeight 2`,
  minWidth 250dp, minHeight 110dp), dá sa natiahnuť do šírky.

## Zapísať 1×1

- Zaoblený štvorec (polomer 26 dp, pri 1×1 vyzerá ako ikona) v `w_accent`
  s veľkým „+" v `w_on_accent`. Nič viac — žiadny text v 1×1.
- Ťuknutie otvorí appku na `/dnes?zachytit=1` (rovnako ako dlaždica).
- `targetCellWidth/Height 1`, nemení veľkosť, popis „Zapísať úlohu".

## Dáta (web, spätne kompatibilné rozšírenie `GET /api/widget`)

```json
"reserveMin": 235,
"over": false,
"dayOver": false,
"timeline": {
  "startMin": 420, "endMin": 1320, "nowMin": 592,
  "blocks": [ { "kind": "lesson|meeting|event|task", "startMin": 480, "endMin": 525,
                "color": "#7a4fd6", "frog": false } ]
},
"next": [ { "id": "…", "title": "…", "color": "#7a4fd6" } ]
```
`timeline` z `layoutDay` presne ako pravítko na obrazovke Dnes (rovnaké
zdroje: hodiny, kalendár, udalosti, úlohy), `color` hex (`src/lib/oklch.ts`)
alebo `null`. `next` = najviac 2 nasledujúce úlohy podľa osi (prvé po teraz),
inak prvé otvorené v poradí Dnes. Logika v `src/lib/widget-payload.ts` s testami.
