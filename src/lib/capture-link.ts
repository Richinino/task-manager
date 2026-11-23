/**
 * Odkazy na rýchle zachytenie: `/dnes?zachytit=1&text=…` a príjem zdieľania
 * z Androidu (`/zdielat?title=…&text=…&url=…`). Čistá logika bez závislostí.
 */

/** Najviac znakov predvyplneného textu — zvyšok sa zahodí. */
export const CAPTURE_TEXT_MAX = 500;

export const CAPTURE_PARAM = "zachytit";
export const CAPTURE_TEXT_PARAM = "text";

export interface CaptureParams {
  /** Či adresa žiada otvoriť zachytenie. */
  open: boolean;
  /** Orezaný text, alebo `undefined`, keď nie je čo predvyplniť. */
  text: string | undefined;
}

function clean(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, CAPTURE_TEXT_MAX).trim();
}

/** Prečíta `zachytit` a `text` z parametrov adresy. */
export function readCaptureParams(params: {
  get(name: string): string | null;
}): CaptureParams {
  const text = clean(params.get(CAPTURE_TEXT_PARAM));
  return {
    open: params.get(CAPTURE_PARAM) === "1",
    text: text === "" ? undefined : text,
  };
}

/** Adresa, ktorá otvorí zachytenie (s predvyplneným textom, ak nejaký je). */
export function buildCaptureHref(text?: string, path = "/dnes"): string {
  const cleaned = clean(text);
  const query = new URLSearchParams({ [CAPTURE_PARAM]: "1" });
  if (cleaned !== "") query.set(CAPTURE_TEXT_PARAM, cleaned);
  return `${path}?${query.toString()}`;
}

/**
 * Spojí `title`, `text` a `url` zo zdieľania do jedného textu.
 * Veľa appiek dáva URL aj do `text`, takže časť, ktorá už je obsiahnutá
 * v predchádzajúcich, sa preskočí. Poradie: title, text, url.
 */
export function joinSharedText(parts: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}): string {
  const picked: string[] = [];
  for (const raw of [parts.title, parts.text, parts.url]) {
    const part = (raw ?? "").replace(/\s+/g, " ").trim();
    if (part === "") continue;
    const lower = part.toLowerCase();
    if (picked.some((p) => p.toLowerCase().includes(lower))) continue;
    picked.push(part);
  }
  return picked.join(" ").slice(0, CAPTURE_TEXT_MAX).trim();
}

/** Odstráni z parametrov adresy `zachytit` a `text`, ostatné nechá. */
export function stripCaptureParams(params: { toString(): string }): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  next.delete(CAPTURE_PARAM);
  next.delete(CAPTURE_TEXT_PARAM);
  return next;
}
