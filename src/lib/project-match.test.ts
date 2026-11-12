import { describe, expect, it } from "vitest";

import { findProject, matchProjectAt, projectExists, projectKey } from "@/lib/project-match";

describe("projectKey", () => {
  it("bez diakritiky, malé písmená, oddeľovače ako jedna medzera", () => {
    expect(projectKey("  3D  Tlačiareň ")).toBe("3d tlaciaren");
    expect(projectKey("3D-tlačiareň")).toBe("3d tlaciaren");
    expect(projectKey("web_stránka - nová")).toBe("web stranka nova");
  });
});

describe("findProject a projectExists", () => {
  const projekty = [
    { id: "a", name: "3D tlačiareň" },
    { id: "b", name: "3D" },
  ];

  it("nájde projekt podľa kľúča", () => {
    expect(findProject("3d tlaciaren", projekty)?.id).toBe("a");
    expect(findProject("3D-TLAČIAREŇ", projekty)?.id).toBe("a");
    expect(findProject("3d", projekty)?.id).toBe("b");
    expect(findProject("tlačiareň", projekty)).toBeUndefined();
    expect(findProject("  ", projekty)).toBeUndefined();
  });

  it("projectExists pracuje s holými menami", () => {
    expect(projectExists("3d tlaciaren", ["3D tlačiareň"])).toBe(true);
    expect(projectExists("3d tlac", ["3D tlačiareň"])).toBe(false);
  });
});

describe("matchProjectAt", () => {
  const mena = ["3D", "3D tlačiareň"];

  it("vyberie najdlhšie meno a vráti koniec zhody", () => {
    const text = "+3D tlaciaren zajtra";
    expect(matchProjectAt(text, 1, mena)).toEqual({ name: "3D tlačiareň", end: 13 });
  });

  it("meno musí skončiť na hranici slova", () => {
    expect(matchProjectAt("+3D tlaciarenka", 1, mena)).toEqual({ name: "3D", end: 3 });
    expect(matchProjectAt("+3Dx", 1, mena)).toBeNull();
  });

  it("zhoda začína presne na danom mieste", () => {
    expect(matchProjectAt("+ 3D", 1, mena)).toBeNull();
  });

  it("prázdny zoznam nič nenájde", () => {
    expect(matchProjectAt("+3D", 1, [])).toBeNull();
  });
});
