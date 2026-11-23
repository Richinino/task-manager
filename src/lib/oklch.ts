/**
 * Prevod `oklch(L C H)` na hex — widget na ploche nepozná CSS farby paliet.
 *
 * Používa sa len na farby z `areaColorValue`. Čokoľvek iné (napr. `var(--x)`)
 * vráti `null`, nech sa volajúci rozhodne sám.
 */

const OKLCH_RE = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i;

function gamma(linear: number): number {
  const c = Math.min(1, Math.max(0, linear));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function channel(linear: number): string {
  return Math.round(gamma(linear) * 255)
    .toString(16)
    .padStart(2, "0");
}

/** `L` 0–1, `C` chroma, `h` v stupňoch. Mimo gamutu sa kanály orežú. */
export function oklchToHex(l: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;

  return `#${channel(r)}${channel(g)}${channel(bl)}`;
}

/** `"oklch(0.60 0.20 295)"` → `"#…"`; iný vstup → `null`. */
export function cssColorToHex(value: string): string | null {
  const match = OKLCH_RE.exec(value.trim());
  if (match === null) return null;
  const [l, c, h] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (![l, c, h].every(Number.isFinite)) return null;
  return oklchToHex(l, c, h);
}
