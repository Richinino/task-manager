import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * OAuth 2.1 pre MCP — čistá logika bez databázy.
 *
 * Appka je autorizačný server pre vlastný MCP endpoint (`/api/mcp`). Tu je
 * všetko, čo sa dá rozhodnúť bez databázy a bez požiadavky: tvar tokenov,
 * PKCE, ktoré adresy presmerovania sú prípustné. Rozhodnutia a ich dôvody
 * sú v `docs/MCP.md`.
 */

/** Jediný rozsah. Nástroje čítajú aj menia — rozlišovať by nebolo čo. */
export const OAUTH_SCOPE = "tasks";

/** Kód žije desať minút — na odkliknutie súhlasu a výmenu úplne stačí. */
export const CODE_TTL_MS = 10 * 60 * 1000;
/** Prístupový token hodinu: keď unikne, neplatí dlho. */
export const ACCESS_TTL_S = 60 * 60;
/** Obnovovací dva mesiace — ranný rituál sa nemá pýtať na prihlásenie každý týždeň. */
export const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Nový tajný reťazec s predponou. Predpona nič nezabezpečuje, len povie,
 * čo to je, keď sa token niekde objaví (`tm_at_` prístupový, `tm_rt_`
 * obnovovací, `tm_code_` kód).
 */
export function newSecret(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

/**
 * Odtlačok, ktorý sa ukladá namiesto tokenu. SHA-256 bez soli stačí: token
 * má 256 bitov náhody, takže ho nikto neuhádne ani cez tabuľky.
 */
export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

/** Porovnanie, ktoré neprezradí zhodu časom odpovede. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PKCE (RFC 7636) — povinné, len S256
   ═══════════════════════════════════════════════════════════════════════════ */

const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;
/** SHA-256 v base64url bez paddingu má vždy 43 znakov. */
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export function isValidChallenge(challenge: string): boolean {
  return CHALLENGE_RE.test(challenge);
}

/** Sedí `code_verifier` na výzvu, ktorú klient poslal pri autorizácii? */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!VERIFIER_RE.test(verifier) || !isValidChallenge(challenge)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(computed, challenge);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADRESY PRESMEROVANIA
   ═══════════════════════════════════════════════════════════════════════════ */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Smie sa táto adresa zaregistrovať ako návratová?
 *
 * Len `https`, alebo `http` na vlastný počítač (RFC 8252 — nástroje ako
 * MCP Inspector či editory počúvajú na lokálnom porte). Iné schémy nie:
 * kód poslaný na `http://` cez sieť by mohol ktokoľvek po ceste odchytiť.
 * Fragment je zakázaný — kód sa pridáva do query a `#` by ho odrezal.
 */
export function checkRedirectUri(raw: string): { ok: true } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Adresa presmerovania nie je platná URL." };
  }
  if (url.hash !== "") return { ok: false, reason: "Adresa presmerovania nesmie mať fragment." };
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "Adresa presmerovania nesmie obsahovať meno ani heslo." };
  }
  if (url.protocol === "https:") return { ok: true };
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return { ok: true };
  return { ok: false, reason: "Adresa presmerovania musí byť https (alebo http na localhost)." };
}

/**
 * Zhoduje sa požadovaná adresa so zaregistrovanou?
 *
 * Presne, znak po znaku. Jediná výnimka je port pri lokálnej adrese
 * (RFC 8252 §7.3): lokálny nástroj dostane voľný port až pri spustení,
 * takže ho pri registrácii nemôže poznať.
 */
export function redirectMatches(registered: readonly string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let req: URL;
  try {
    req = new URL(requested);
  } catch {
    return false;
  }
  if (req.protocol !== "http:" || !LOOPBACK.has(req.hostname)) return false;
  return registered.some((uri) => {
    try {
      const reg = new URL(uri);
      return (
        reg.protocol === "http:" &&
        reg.hostname === req.hostname &&
        reg.pathname === req.pathname &&
        reg.search === req.search
      );
    } catch {
      return false;
    }
  });
}

/** Pridá parametre k adrese presmerovania a zachová tie, ktoré už má. */
export function withParams(uri: string, params: Record<string, string | undefined>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

/* ═══════════════════════════════════════════════════════════════════════════
   DROBNOSTI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Kam sa vrátiť po prihlásení (`/prihlasenie?dalej=…`).
 *
 * Len cesta v rámci appky. `//zlo.sk` a `/\zlo.sk` prehliadač chápe ako inú
 * doménu, takže by z prihlásenia spravili presmerovanie kamkoľvek.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  if (raw.length > 4000) return null;
  return raw;
}

/** `Authorization: Basic …` → meno a heslo klienta (RFC 6749 §2.3.1). */
export function parseBasicAuth(header: string | null): { id: string; secret: string } | null {
  if (header === null || !/^basic /i.test(header)) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  } catch {
    return null;
  }
  const colon = decoded.indexOf(":");
  if (colon <= 0) return null;
  try {
    return {
      id: decodeURIComponent(decoded.slice(0, colon)),
      secret: decodeURIComponent(decoded.slice(colon + 1)),
    };
  } catch {
    return null;
  }
}

/** `Authorization: Bearer …` → token, alebo `null`. */
export function parseBearer(header: string | null): string | null {
  if (header === null) return null;
  const match = /^bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
