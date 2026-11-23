import { describe, expect, it } from "vitest";

import {
  buildCaptureHref,
  CAPTURE_TEXT_MAX,
  joinSharedText,
  readCaptureParams,
  stripCaptureParams,
} from "./capture-link";

describe("readCaptureParams", () => {
  it("číta zachytit a text", () => {
    const r = readCaptureParams(new URLSearchParams("zachytit=1&text=%20Kúpiť%20%20mlieko "));
    expect(r).toEqual({ open: true, text: "Kúpiť mlieko" });
  });
  it("bez zachytit neotvára", () => {
    expect(readCaptureParams(new URLSearchParams("text=x")).open).toBe(false);
    expect(readCaptureParams(new URLSearchParams("zachytit=1")).text).toBeUndefined();
  });
  it("obmedzí dĺžku", () => {
    const r = readCaptureParams(new URLSearchParams({ zachytit: "1", text: "a".repeat(900) }));
    expect(r.text).toHaveLength(CAPTURE_TEXT_MAX);
  });
});

describe("buildCaptureHref", () => {
  it("bez textu", () => expect(buildCaptureHref()).toBe("/dnes?zachytit=1"));
  it("s textom", () => {
    expect(buildCaptureHref("a b&c")).toBe("/dnes?zachytit=1&text=a+b%26c");
  });
});

describe("joinSharedText", () => {
  it("zachová poradie title, text, url", () => {
    expect(joinSharedText({ title: "T", text: "X", url: "https://a.sk" })).toBe("T X https://a.sk");
  });
  it("preskočí URL, ktorá už je v texte", () => {
    expect(
      joinSharedText({ title: "Článok", text: "Pozri https://a.sk/x", url: "https://a.sk/x" }),
    ).toBe("Článok Pozri https://a.sk/x");
  });
  it("preskočí duplicitný title a text", () => {
    expect(joinSharedText({ title: "Ahoj", text: "ahoj" })).toBe("Ahoj");
  });
  it("zvláda prázdne vstupy", () => {
    expect(joinSharedText({ title: null, text: "  ", url: undefined })).toBe("");
  });
});

describe("stripCaptureParams", () => {
  it("nechá ostatné parametre", () => {
    expect(
      stripCaptureParams(new URLSearchParams("den=2026-11-23&zachytit=1&text=x")).toString(),
    ).toBe("den=2026-11-23");
  });
});
