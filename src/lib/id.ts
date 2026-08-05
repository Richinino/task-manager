/**
 * UUID v7 — časovo zoradené identifikátory.
 *
 * Generujú sa na klientovi, aby vytváranie záznamov fungovalo aj offline (M2).
 * Časová predpona navyše znamená, že vkladanie do indexu je sekvenčné,
 * na rozdiel od náhodného UUID v4.
 */
export function uuidv7(): string {
  const ts = Date.now();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // 48 bitov času (big-endian) do prvých 6 bajtov
  bytes[0] = (ts / 2 ** 40) & 0xff;
  bytes[1] = (ts / 2 ** 32) & 0xff;
  bytes[2] = (ts / 2 ** 24) & 0xff;
  bytes[3] = (ts / 2 ** 16) & 0xff;
  bytes[4] = (ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;

  // verzia 7 v hornom nibble bajtu 6
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // variant RFC 4122 v horných dvoch bitoch bajtu 8
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i]!.toString(16).padStart(2, "0"));
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
