# Stavba: zvyšných 7 widgetov (Android 1.5)

Hotové a používané: Pravítko 4×2, Zapísať 1×1, Dnes 4×3 (`STAVBA-WIDGETY.md`).
Teraz pribudnú, aby si používateľ mohol vyberať: **Žaba 2×2, Teraz 4×1,
Kopa 2×2, Škola 2×2, Týždeň 4×2, Zapísať 2×1, Rezerva 2×1**. Vzhľad presne
podľa `widgety.html` (katalóg, čísla 1, 2, 5, 6, 7, 8, 9) a textu v
`ZADANIE-WIDGETY.md`. Farby a pravidlá z `STAVBA-WIDGETY.md` (zdroje `w_*`,
dynamická paleta Samsungu na Androide 12+, žaba a oblasti sa nemenia,
preplnenie pokojne bez červenej).

## Dáta: rozšírenie `GET /api/widget` (spätne kompatibilné)

```json
"now": { "title": "Prestávka", "detail": "o 8 min FYZ v F2" } | null,
"queue": [ { "id": "…", "title": "…", "estimate": "45 min" | null,
             "color": "#7a4fd6" | null, "frog": true, "overdueDays": null } ],
"school": {
  "next": { "code": "FYZ", "time": "10:00", "room": "F2", "color": "#…" | null,
            "exam": false } | null,
  "lessons": [ { "code": "SJL", "state": "past|now|future", "cancelled": false } ],
  "afterSchool": "Zajtra prvá SJL o 8:00" | null
} | null,
"week": [ { "date": "2026-11-23", "dayShort": "po", "dayNum": 23, "today": true,
            "plannedMin": 185, "freeMin": 420, "exam": false } ]
```
- `now`: ako pilulka na obrazovke Dnes (`src/lib/now-label.ts`). Po škole,
  keď pilulka nemá čo povedať: `{ "title": "Po škole", "detail": "voľno do 16:30" }`
  (najbližšia udalosť z osi), inak `null`.
- `queue`: poradie kopy kariet na Dnes (žaba → po termíne → ostatné), max 6,
  `overdueDays` pri po termíne. Farba ako pri kartách (`cardFill`: oblasť →
  predmet → `null`), hex.
- `school`: dnešné hodiny (bez zrušených v `next`), `next` = prebiehajúca alebo
  najbližšia, `exam` ak na nej je písomka/skúšanie (agenda na hodine).
  `afterSchool` keď je po poslednej hodine alebo dnes nie je škola: prvá
  hodina najbližšieho školského dňa. `null`, keď rozvrh nie je vôbec.
- `week`: 7 dní aktuálneho týždňa presne ako telefónny Týždeň
  (`src/lib/plan-mobile.ts`, rovnaké zdroje ako `/tyzden`, vrátane Google kalendára).

## Widgety (každý vlastný `AppWidgetProvider`, xml s `targetCellWidth/Height`,
`previewLayout`, slovenským popisom; spoločný cache JSON, spoločné obnovenie)

| # | Widget | Veľkosť | Obsah | Ťuknutie |
|---|---|---|---|---|
| 1 | Žaba | 2×2 | celá plocha jantárová, hviezda + „Priorita dňa", názov (max 3 riadky), odhad, kruh na odškrtnutie; bez žaby: prvá úloha z `queue` v jej farbe s „Ďalšia" | kruh → hotovo (ako vo Dnes), plocha → `/dnes` |
| 2 | Teraz | 4×1 | jantárová bodka, `now.title` / `now.detail`, pilulka s prvou úlohou z `queue`, čierny kruh „+" | „+" → zachytenie, inak `/dnes` |
| 5 | Kopa | 2×2 | vrchná karta z `queue` v plnej farbe (žaba jantárová, bez farby `w_accent`), za ňou 2 vykúkajúce (užšie, posunuté), „1 z N", názov, odhad, kruh fajka + kruh „ďalšia" | fajka → hotovo; „ďalšia" → posunie lokálny index v prefs a prekreslí (bez siete); karta → `/dnes` |
| 6 | Škola | 2×2 | veľká skratka `next.code` vo farbe predmetu, „10:00 v F2", pilulka „písomka" ak `exam`, rad bodiek za `lessons` (plná = minulá, obrys = teraz, slabá = budúca); po škole „Škola skončila" + `afterSchool` | → `/rozvrh` |
| 7 | Týždeň | 4×2 | „Týždeň 23.–29. 11." + súčet naplánovaného; 7 stĺpcov: skratka dňa, číslo, zvislý pás kapacity (obrázok alebo vrstvené View s výškou), dnes `w_accent`, ostatné `w_muted`, preplnený plný bez červenej, malá ikonka pri `exam` | stĺpec → `/dnes?den=<date>` |
| 8 | Zapísať | 2×1 | čierna pilulka „+ Zapísať" a kruh s mikrofónom | pilulka aj mikrofón → `/dnes?zachytit=1` |
| 9 | Rezerva | 2×1 | veľké „3 h 55" (Archivo/sans-serif-black), „rezerva dnes", tenký pás kapacity; preplnené „o 30 min viac"; po dni „Deň sa skončil" | → `/dnes` |

Spoločné stavy pre všetky: nepripojené → „Pripoj widget v appke:
Knižnica → Nastavenia → Telefón" (ťuknutie → `/nastavenia#telefon`); bez
spojenia → posledné dáta + „bez spojenia"; chýbajúce nové polia (starý
server) → rozumná náhrada, nikdy pád.
