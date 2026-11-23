# Telefón — čo treba vyriešiť

Zoznam funkcií, ktoré majú zmysel až na telefóne. Pribúda sem priebežne;
odškrtnuté sa nemaže, len označí `[x]` s dátumom a commitom.

**Prečo tento súbor vznikol (analýza 22. 11. 2026):** appka sa nepoužíva
prirodzene, lebo **nechodí za tebou** — kým ju sám neotvoríš, neexistuje.
Populárne appky (Todoist, TickTick, Google Tasks) sa držia hlavne tým, že
zápis trvá pár sekúnd odkiaľkoľvek a dnešok vidíš bez rozhodnutia ho otvoriť.
Preto má každá položka nižšie jednu otázku: **skráti to cestu od „spomenul
som si" k „je to uložené", alebo prinesie dnešok pred oči sám?**

Appka na telefóne je TWA (Chrome vo vnútri `.apk`). Väčšina vecí sa postaví
vo webovom kóde; čo vyžaduje natívny Android (Kotlin v projekte z Bubblewrapu),
je označené **[natívne]**.

---

## 1. Zachytenie bez otvárania appky

- [x] (23. 11. 2026) **Widget na ploche „Dnes" s tlačidlom „+"** — **[natívne]** — najväčší
      účinok zo všetkého. Ukazuje prioritu dňa a 3–5 dnešných úloh, ťuknutie
      na úlohu ju odškrtne, „+" otvorí rovno zachytenie. Dáta z API
      (rovnaký obsah ako MCP `get_day`), obnova pri odškrtnutí + periodicky.
- [x] (22. 11. 2026) **Hlasový vstup v zachytení** — ikona mikrofónu v poli zachytenia,
      `SpeechRecognition` s `lang = "sk-SK"`, výsledný text ide cez ten istý
      parser („zajtra o 15:00 tréning 2h"). Overiť, či ho Chrome v TWA pustí;
      ak nie, **[natívne]** cez `RecognizerIntent`.
- [x] (23. 11. 2026, len text a odkazy — fotky čakajú na prílohy) **Zdieľanie do appky (share target)** — `share_target` v manifeste:
      odkaz, text alebo fotka (zadanie z tabule) z inej appky → nová úloha
      v inboxe. Funguje aj v TWA.
- [ ] **Zachytenie z notifikácie** — trvalá (alebo ranná) notifikácia
      s tlačidlom „Zapísať", ktoré otvorí zachytenie. Odpoveď priamo
      v notifikácii (inline reply) je **[natívne]**.
- [x] (23. 11. 2026) **Dlaždica v rýchlych nastaveniach** (Quick Settings tile) — jedno
      potiahnutie zhora → zachytenie. **[natívne]**
- [x] Skratky pri dlhom podržaní ikony (Dnes, Inbox) — už sú v `manifest.ts`.
- [x] Zápis bez signálu — fronta v `src/lib/outbox.ts`.

## 2. Dnešok príde sám

- [x] (23. 11. 2026) **Jedna notifikácia denne po škole** (čas podľa rozvrhu — po poslednej
      hodine, cez víkend v nastavený čas): „Dnes: 3 veci. Začni s X."
      Ťuknutie otvorí Dnes, tlačidlo „Hotovo" odškrtne prvú. Nie spam:
      jedna denne, dá sa vypnúť.
- [x] (23. 11. 2026, aj „O hodinu") **Odškrtnutie priamo z pripomienky** — akcia „Hotovo" na notifikácii
      pripomienky (Web Push `actions`), bez otvárania appky.
- [x] (23. 11. 2026) **Pred písomkou** — večer pred písomkou jedna notifikácia s tým, čo
      je naplánované na prípravu.

## 3. Nech to nepôsobí ako výčitka

- [ ] Na telefóne neukazovať na prvej obrazovke nulové série návykov ani
      mínusový rozpočet — patria do detailu, nie do prvého pohľadu.
- [x] (22. 11. 2026, karta na Dnes) Gesto potiahnutia doprava = hotovo (je v smere A z `dizajn-android/SMERY.md`).

---

## Widgety z návrhu, ktoré čakajú

Návrh deviatich widgetov je v [`dizajn-android/widgety.html`](dizajn-android/widgety.html)
(zadanie `dizajn-android/ZADANIE-WIDGETY.md`). Postavené sú Pravítko 4×2,
Zapísať 1×1 a Dnes 4×3. Čakajú: Žaba 2×2, Teraz 4×1, Kopa 2×2, Škola 2×2,
Týždeň 4×2, Zapísať 2×1, Rezerva 2×1.

- [ ] Ťuknutie na ↻ a odškrtnutie vo widgete spúšťať cez krátku aktivitu
      v popredí, aby fungovalo aj bez výnimky z batérie (Samsung inak appke
      na pozadí blokuje sieť).

## Nápady, ktoré ešte nie sú rozhodnuté

- Widget na zamknutej obrazovke / Always On Display (Samsung).
- „Ok Google, pridaj úlohu…" — App Actions **[natívne]**, zložité; možno
  stačí hlasový vstup v zachytení.
- Zachytenie cez Claude (MCP server už existuje — „zapíš mi…").
