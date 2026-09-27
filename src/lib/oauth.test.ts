import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  checkRedirectUri,
  hashSecret,
  isValidChallenge,
  newSecret,
  parseBasicAuth,
  parseBearer,
  pkceMatches,
  redirectMatches,
  safeNextPath,
  withParams,
} from "./oauth";

const VERIFIER = "dBjftJeZ4CVP-mJ92K1R8zgQv4EQfyUIsWc1TjQX8Tk-~.";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

describe("tokeny", () => {
  it("nesú predponu a sú zakaždým iné", () => {
    const a = newSecret("tm_at");
    expect(a.startsWith("tm_at_")).toBe(true);
    expect(a).not.toBe(newSecret("tm_at"));
  });

  it("odtlačok je stály a nevracia token", () => {
    expect(hashSecret("x")).toBe(hashSecret("x"));
    expect(hashSecret("x")).not.toContain("x");
  });
});

describe("PKCE", () => {
  it("S256 sedí na správny verifier", () => {
    expect(isValidChallenge(CHALLENGE)).toBe(true);
    expect(pkceMatches(VERIFIER, CHALLENGE)).toBe(true);
  });

  it("iný alebo nepovolený verifier neprejde", () => {
    expect(pkceMatches(`${VERIFIER}x`, CHALLENGE)).toBe(false);
    expect(pkceMatches("krátky", CHALLENGE)).toBe(false);
    expect(pkceMatches(`${VERIFIER}!`, CHALLENGE)).toBe(false);
    expect(pkceMatches(VERIFIER, "plain-nie-je-s256")).toBe(false);
  });
});

describe("adresy presmerovania", () => {
  it("https a lokálne http áno", () => {
    expect(checkRedirectUri("https://claude.ai/api/mcp/auth_callback").ok).toBe(true);
    expect(checkRedirectUri("http://localhost:6274/oauth/callback").ok).toBe(true);
    expect(checkRedirectUri("http://127.0.0.1:33418/").ok).toBe(true);
  });

  it("http cez sieť, iné schémy, fragment a heslo nie", () => {
    expect(checkRedirectUri("http://zlo.sk/cb").ok).toBe(false);
    expect(checkRedirectUri("javascript:alert(1)").ok).toBe(false);
    expect(checkRedirectUri("https://claude.ai/cb#x").ok).toBe(false);
    expect(checkRedirectUri("https://a:b@claude.ai/cb").ok).toBe(false);
    expect(checkRedirectUri("nie url").ok).toBe(false);
  });

  it("zhoda je presná, len lokálny port sa smie líšiť", () => {
    const reg = ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1/callback"];
    expect(redirectMatches(reg, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectMatches(reg, "https://claude.ai/api/mcp/auth_callback/")).toBe(false);
    expect(redirectMatches(reg, "https://claude.ai.zlo.sk/api/mcp/auth_callback")).toBe(false);
    expect(redirectMatches(reg, "http://127.0.0.1:51234/callback")).toBe(true);
    expect(redirectMatches(reg, "http://127.0.0.1:51234/iny")).toBe(false);
    expect(redirectMatches(reg, "http://localhost:51234/callback")).toBe(false);
  });

  it("parametre sa pridajú k existujúcim", () => {
    expect(withParams("https://a.sk/cb?x=1", { code: "c", state: "s", nic: undefined })).toBe(
      "https://a.sk/cb?x=1&code=c&state=s",
    );
  });
});

describe("drobnosti", () => {
  it("po prihlásení len cesta v appke", () => {
    expect(safeNextPath("/oauth/authorize?client_id=x")).toBe("/oauth/authorize?client_id=x");
    expect(safeNextPath("//zlo.sk")).toBeNull();
    expect(safeNextPath("/\\zlo.sk")).toBeNull();
    expect(safeNextPath("https://zlo.sk")).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });

  it("Basic a Bearer hlavičky", () => {
    const basic = `Basic ${Buffer.from("klient%3A1:taj:ne").toString("base64")}`;
    expect(parseBasicAuth(basic)).toEqual({ id: "klient:1", secret: "taj:ne" });
    expect(parseBasicAuth("Bearer x")).toBeNull();
    expect(parseBearer("Bearer tm_at_abc")).toBe("tm_at_abc");
    expect(parseBearer("bearer   tm_at_abc ")).toBe("tm_at_abc");
    expect(parseBearer("Basic x")).toBeNull();
    expect(parseBearer(null)).toBeNull();
  });
});
