import { describe, expect, it } from "vitest";

import {
  distanceMeters,
  formatDistance,
  nearestPlace,
  placesToText,
  textToPlaces,
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

describe("placesToText a textToPlaces", () => {
  it("prežije cestu tam a späť", () => {
    const places: Place[] = [
      { context: "domino", lat: 48.1445, lon: 17.1102 },
      { context: "praca", lat: 48.15, lon: 17.12 },
    ];
    expect(textToPlaces(placesToText(places))).toEqual(places);
  });

  /*
    Zápis používa čiarku ako oddeľovač dvojice, rozoberanie zas medzeru —
    drží to pohromade len vďaka medzere za čiarkou. Preto je na to test.
  */
  it("zvládne vlastný zápisový tvar s čiarkou", () => {
    expect(textToPlaces("domino = 48.1445, 17.1102")).toEqual([
      { context: "domino", lat: 48.1445, lon: 17.1102 },
    ]);
  });

  it("desatinná čiarka funguje ako bodka", () => {
    expect(textToPlaces("domino = 48,1445 17,1102")).toEqual([
      { context: "domino", lat: 48.1445, lon: 17.1102 },
    ]);
  });

  it("stredník ako oddeľovač tiež prejde", () => {
    expect(textToPlaces("domino = 48.14; 17.11")).toEqual([
      { context: "domino", lat: 48.14, lon: 17.11 },
    ]);
  });

  it("zavináč v názve sa odsekne", () => {
    expect(textToPlaces("@domino = 48.14 17.11")[0]?.context).toBe("domino");
  });

  it("rozpísaný riadok nezhodí zvyšok", () => {
    const text = ["domino = 48.14 17.11", "rozpisane", "praca = 48.15 17.12"].join("\n");
    expect(textToPlaces(text)).toHaveLength(2);
  });

  it("riadok s jedným číslom sa zahodí", () => {
    expect(textToPlaces("domino = 48.14")).toEqual([]);
  });

  it("súradnice mimo rozsahu sa zahodia", () => {
    expect(textToPlaces("x = 200 17")).toEqual([]);
    expect(textToPlaces("x = 48 400")).toEqual([]);
  });

  it("záporné súradnice sú v poriadku", () => {
    expect(textToPlaces("juh = -33.86, 151.2")).toEqual([
      { context: "juh", lat: -33.86, lon: 151.2 },
    ]);
  });

  it("prázdny text dá prázdny zoznam", () => {
    expect(textToPlaces("")).toEqual([]);
  });
});
