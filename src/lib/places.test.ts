import { describe, expect, it } from "vitest";

import {
  distanceMeters,
  formatDistance,
  nearestPlace,
  parseCoordinates,
  placesToText,
  textToPlaceEntries,
  type Place,
} from "@/lib/places";

/** Bratislava, Hlavné námestie — a pár bodov okolo. */
const BA = { lat: 48.1439, lon: 17.1097 };

const PLACES: Place[] = [
  { context: "domino", lat: 48.1445, lon: 17.1102 },
  { context: "praca", lat: 48.1500, lon: 17.1200 },
  { context: "kosice", lat: 48.7164, lon: 21.2611 },
];

describe("distanceMeters", () => {
  it("ten istý bod má nulu", () => {
    expect(distanceMeters(BA, BA)).toBe(0);
  });

  it("je symetrická", () => {
    const a = { lat: 48.1, lon: 17.1 };
    const b = { lat: 48.7, lon: 21.2 };
    expect(distanceMeters(a, b)).toBe(distanceMeters(b, a));
  });

  it("Bratislava – Košice je zhruba 300 km", () => {
    const meters = distanceMeters(BA, { lat: 48.7164, lon: 21.2611 });
    expect(meters).toBeGreaterThan(290_000);
    expect(meters).toBeLessThan(320_000);
  });

  it("stovky metrov vychádzajú v očakávanom ráde", () => {
    const meters = distanceMeters(BA, { lat: 48.1445, lon: 17.1102 });
    expect(meters).toBeGreaterThan(40);
    expect(meters).toBeLessThan(150);
  });

  /*
    Toto je dôvod, prečo sa neodčítavajú stupne: rovnaký rozdiel v zemepisnej
    dĺžke je pri póle oveľa kratší než na rovníku.
  */
  it("stupeň dĺžky je pri póle kratší než na rovníku", () => {
    const rovnik = distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    const sever = distanceMeters({ lat: 80, lon: 0 }, { lat: 80, lon: 1 });
    expect(sever).toBeLessThan(rovnik / 3);
  });
});

describe("nearestPlace", () => {
  it("nájde najbližšie miesto", () => {
    expect(nearestPlace(BA, PLACES)?.place.context).toBe("domino");
  });

  it("vzdialené miesta odfiltruje", () => {
    expect(nearestPlace({ lat: 48.7164, lon: 21.2611 }, PLACES, 500)?.place.context).toBe(
      "kosice",
    );
  });

  it("keď nie je nič v okruhu, vráti null", () => {
    expect(nearestPlace({ lat: 0, lon: 0 }, PLACES)).toBeNull();
  });

  it("prázdny zoznam miest dá null", () => {
    expect(nearestPlace(BA, [])).toBeNull();
  });

  it("vracia aj vzdialenosť", () => {
    const found = nearestPlace(BA, PLACES);
    expect(found?.meters).toBeGreaterThan(0);
  });

  it("širší okruh nájde aj vzdialenejšie miesto", () => {
    expect(nearestPlace(BA, PLACES, 50)).toBeNull();
    expect(nearestPlace(BA, PLACES, 5000)?.place.context).toBe("domino");
  });
});

describe("formatDistance", () => {
  it("metre pod kilometrom", () => {
    expect(formatDistance(120)).toBe("120 m");
    expect(formatDistance(999)).toBe("999 m");
  });

  it("kilometre s desatinnou čiarkou", () => {
    expect(formatDistance(1400)).toBe("1,4 km");
    expect(formatDistance(1000)).toBe("1,0 km");
  });
});

describe("placesToText", () => {
  it("vypíše adresu, nie súradnice — práve tú človek napísal", () => {
    const places: Place[] = [
      { context: "domino", address: "Trnavská cesta 100, Bratislava", lat: 48.1, lon: 17.1 },
    ];
    expect(placesToText(places)).toBe("domino = Trnavská cesta 100, Bratislava");
  });

  /*
    Miesta uložené ešte pred adresami adresu nemajú. Keby sa vypísali prázdne
    alebo inak, po prvom otvorení nastavení by sa ticho zmenili na niečo iné.
  */
  it("miesto bez adresy vypíše súradnicami", () => {
    expect(placesToText([{ context: "domino", lat: 48.1445, lon: 17.1102 }])).toBe(
      "domino = 48.1445, 17.1102",
    );
  });

  it("prázdny zoznam dá prázdny text", () => {
    expect(placesToText([])).toBe("");
  });
});

describe("textToPlaceEntries", () => {
  it("rozdelí riadok na kontext a adresu", () => {
    expect(textToPlaceEntries("domino = Trnavská cesta 100, Bratislava")).toEqual([
      { context: "domino", query: "Trnavská cesta 100, Bratislava" },
    ]);
  });

  it("zavináč v názve sa odsekne", () => {
    expect(textToPlaceEntries("@domino = Bratislava")[0]?.context).toBe("domino");
  });

  it("rozpísaný riadok nezhodí zvyšok", () => {
    const text = ["domino = Bratislava", "rozpisane", "praca = Košice"].join("\n");
    expect(textToPlaceEntries(text)).toHaveLength(2);
  });

  it("riadok bez pravej strany sa zahodí — nemá sa čo prekladať", () => {
    expect(textToPlaceEntries("domino =   ")).toEqual([]);
  });

  it("riadok bez kontextu sa zahodí", () => {
    expect(textToPlaceEntries(" = Bratislava")).toEqual([]);
  });

  it("prázdny text dá prázdny zoznam", () => {
    expect(textToPlaceEntries("")).toEqual([]);
  });

  it("adresu neskracuje na prvej čiarke — je jej súčasťou", () => {
    const entry = textToPlaceEntries("a = Hlavná 1, Trnava, Slovensko")[0];
    expect(entry?.query).toBe("Hlavná 1, Trnava, Slovensko");
  });
});

describe("parseCoordinates", () => {
  it("prečíta dvojicu s čiarkou — vlastný zápisový tvar", () => {
    expect(parseCoordinates("48.1445, 17.1102")).toEqual({ lat: 48.1445, lon: 17.1102 });
  });

  it("desatinná čiarka funguje ako bodka", () => {
    expect(parseCoordinates("48,1445 17,1102")).toEqual({ lat: 48.1445, lon: 17.1102 });
  });

  it("stredník ako oddeľovač tiež prejde", () => {
    expect(parseCoordinates("48.14; 17.11")).toEqual({ lat: 48.14, lon: 17.11 });
  });

  it("záporné súradnice sú v poriadku", () => {
    expect(parseCoordinates("-33.86, 151.2")).toEqual({ lat: -33.86, lon: 151.2 });
  });

  /*
    Koncová nula sa pri prevode čísla späť na reťazec stratí. Kontrola tvaru
    preto nesmie stáť na porovnaní s `String(parseFloat(...))`.
  */
  it("koncová nula v desatinnej časti prejde", () => {
    expect(parseCoordinates("48.10, 17.10")).toEqual({ lat: 48.1, lon: 17.1 });
  });

  /*
    Toto je ten dôležitý: adresa sa začína číslom a bez kontroly tvaru by
    `parseFloat` prečítal „100" a zvyšok zahodil — miesto by tak dostalo
    nezmyselné súradnice namiesto toho, aby sa adresa preložila.
  */
  it("adresa začínajúca číslom NIE je dvojica súradníc", () => {
    expect(parseCoordinates("100, Bratislava")).toBeNull();
    expect(parseCoordinates("Trnavská 100")).toBeNull();
  });

  it("jedno číslo nestačí", () => {
    expect(parseCoordinates("48.14")).toBeNull();
  });

  it("tri čísla sú tiež nič", () => {
    expect(parseCoordinates("48.14 17.11 100")).toBeNull();
  });

  it("hodnoty mimo rozsahu sa odmietnu", () => {
    expect(parseCoordinates("200 17")).toBeNull();
    expect(parseCoordinates("48 400")).toBeNull();
  });

  it("prázdny reťazec je null", () => {
    expect(parseCoordinates("   ")).toBeNull();
  });
});
