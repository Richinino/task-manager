import "server-only";

import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { oauthClients, oauthCodes, oauthGrants } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import {
  ACCESS_TTL_S,
  CODE_TTL_MS,
  OAUTH_SCOPE,
  REFRESH_TTL_MS,
  checkRedirectUri,
  hashSecret,
  newSecret,
  pkceMatches,
  redirectMatches,
  safeEqual,
} from "@/lib/oauth";

/* ═══════════════════════════════════════════════════════════════════════════
   OAUTH — AUTORIZAČNÝ SERVER PRE /api/mcp

   Rozhodnutia sú v `docs/MCP.md`. V skratke:

   • Registrácia klientov je otvorená (RFC 7591). Sama nič neotvára — prístup
     vznikne až súhlasom prihláseného človeka na `/oauth/authorize`.
   • Kód sa vydá len s PKCE S256 a platí raz a desať minút.
   • Ukladajú sa len odtlačky tokenov. Token pozná iba klient.
   • Pri obnovení sa vymení prístupový aj obnovovací token (rotácia).
   ═══════════════════════════════════════════════════════════════════════════ */

/** Verejná adresa appky tak, ako ju vidí klient — z hlavičiek požiadavky. */
export function originOf(headers: Headers, fallbackUrl?: string): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host !== null && host !== "") {
    const proto =
      headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return fallbackUrl !== undefined ? new URL(fallbackUrl).origin : "http://localhost:3000";
}

/** Adresa MCP servera — „resource" v zmysle RFC 8707 a RFC 9728. */
export function mcpResource(origin: string): string {
  return `${origin}/api/mcp`;
}

/** Metadáta autorizačného servera (RFC 8414). */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    scopes_supported: [OAUTH_SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    // Návrat nesie `iss` (RFC 9207) — klient tak pozná, ktorý server mu kód vydal.
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/`,
  };
}

/** Metadáta chráneného zdroja (RFC 9728) — kde sa pre `/api/mcp` prihlásiť. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpResource(origin),
    authorization_servers: [origin],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Task manažér",
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   REGISTRÁCIA (RFC 7591)
   ═══════════════════════════════════════════════════════════════════════════ */

const registrationSchema = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().trim().max(100).optional(),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_post", "client_secret_basic"])
    .optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});

export type RegistrationResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata"; description: string };

export async function registerClient(input: unknown): Promise<RegistrationResult> {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_client_metadata",
      description: parsed.error.issues[0]?.message ?? "Neplatné údaje klienta.",
    };
  }
  const data = parsed.data;

  for (const uri of data.redirect_uris) {
    const check = checkRedirectUri(uri);
    if (!check.ok) return { ok: false, error: "invalid_redirect_uri", description: check.reason };
  }
  const grantTypes = data.grant_types ?? ["authorization_code", "refresh_token"];
  if (grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    return {
      ok: false,
      error: "invalid_client_metadata",
      description: "Podporované sú len authorization_code a refresh_token.",
    };
  }
  const responseTypes = data.response_types ?? ["code"];
  if (responseTypes.some((r) => r !== "code")) {
    return { ok: false, error: "invalid_client_metadata", description: "Podporovaný je len response_type code." };
  }

  // RFC 7591 §2: bez uvedenia je predvolené `client_secret_basic`.
  const authMethod = data.token_endpoint_auth_method ?? "client_secret_basic";
  const secret = authMethod === "none" ? null : newSecret("tm_cs");
  const id = newSecret("tm_client");
  const name = data.client_name !== undefined && data.client_name !== "" ? data.client_name : "MCP klient";

  const db = await getDb();
  await db.insert(oauthClients).values({
    id,
    name,
    redirectUris: data.redirect_uris,
    authMethod,
    secretHash: secret === null ? null : hashSecret(secret),
  });

  return {
    ok: true,
    body: {
      client_id: id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: data.redirect_uris,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: authMethod,
      ...(secret !== null ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    },
  };
}

export type OAuthClient = typeof oauthClients.$inferSelect;

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (clientId === "" || clientId.length > 200) return null;
  const db = await getDb();
  const rows = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Overenie klienta pri výmene za token. Verejný klient (`none`) sa overuje
 * len cez PKCE; dôverný musí poslať tajomstvo tak, ako sa zaregistroval.
 */
export function clientAuthenticates(client: OAuthClient, secret: string | null): boolean {
  if (client.authMethod === "none") return true;
  if (client.secretHash === null || secret === null) return false;
  // Tajomstvo sa prijme v hlavičke aj v tele — klienti si v tom nie sú vždy istí.
  return safeEqual(hashSecret(secret), client.secretHash);
}

/* ═══════════════════════════════════════════════════════════════════════════
   KÓD A TOKENY
   ═══════════════════════════════════════════════════════════════════════════ */

export async function createAuthCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
}): Promise<string> {
  const code = newSecret("tm_code");
  const db = await getDb();

  // Upratanie po ceste: staré kódy už nikto nevymení, netreba ich držať.
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));

  await db.insert(oauthCodes).values({
    codeHash: hashSecret(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scope: OAUTH_SCOPE,
    resource: input.resource,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export type TokenResult =
  | { ok: true; body: TokenResponse }
  | { ok: false; error: "invalid_grant" | "invalid_request"; description: string };

function freshTokens() {
  const access = newSecret("tm_at");
  const refresh = newSecret("tm_rt");
  const now = Date.now();
  return {
    access,
    refresh,
    columns: {
      accessHash: hashSecret(access),
      accessExpiresAt: new Date(now + ACCESS_TTL_S * 1000),
      refreshHash: hashSecret(refresh),
      refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
    },
  };
}

function tokenBody(access: string, refresh: string): TokenResponse {
  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: refresh,
    scope: OAUTH_SCOPE,
  };
}

/** `grant_type=authorization_code` — kód raz, s PKCE a tou istou adresou. */
export async function exchangeCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenResult> {
  const db = await getDb();
  const now = new Date();

  /*
    Použitie kódu sa zapíše podmienene (`usedAt is null`) a v tom istom
    príkaze sa vráti riadok. Dve súbežné výmeny toho istého kódu tak nikdy
    nedostanú token obe — druhá nenájde nič.
  */
  const claimed = await db
    .update(oauthCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(oauthCodes.codeHash, hashSecret(input.code)),
        isNull(oauthCodes.usedAt),
        gt(oauthCodes.expiresAt, now),
      ),
    )
    .returning();
  const row = claimed[0];
  if (row === undefined) {
    return { ok: false, error: "invalid_grant", description: "Kód neplatí, vypršal alebo už bol použitý." };
  }
  if (row.clientId !== input.clientId) {
    return { ok: false, error: "invalid_grant", description: "Kód patrí inému klientovi." };
  }
  if (row.redirectUri !== input.redirectUri) {
    return { ok: false, error: "invalid_grant", description: "Adresa presmerovania nesedí s autorizáciou." };
  }
  if (!pkceMatches(input.codeVerifier, row.codeChallenge)) {
    return { ok: false, error: "invalid_grant", description: "PKCE overenie zlyhalo." };
  }

  /*
    Nové pripojenie toho istého klienta nahrádza staré. Keď človek konektor
    v Claude odoberie a pridá znova, v nastaveniach nemajú ostať dve
    „živé" pripojenia, z ktorých jedno už nikto nepoužíva.
  */
  await db
    .update(oauthGrants)
    .set({ revokedAt: now })
    .where(
      and(
        eq(oauthGrants.userId, row.userId),
        eq(oauthGrants.clientId, row.clientId),
        isNull(oauthGrants.revokedAt),
      ),
    );

  const tokens = freshTokens();
  await db.insert(oauthGrants).values({
    id: uuidv7(),
    userId: row.userId,
    clientId: row.clientId,
    scope: row.scope,
    resource: row.resource,
    ...tokens.columns,
  });
  return { ok: true, body: tokenBody(tokens.access, tokens.refresh) };
}

/** `grant_type=refresh_token` — rotácia: starý obnovovací token tým prestáva platiť. */
export async function refreshGrant(input: { refreshToken: string; clientId: string }): Promise<TokenResult> {
  const db = await getDb();
  const now = new Date();
  const tokens = freshTokens();

  // Hľadá sa odtlačkom tokenu — ten sám určuje používateľa, iný filter nemá zmysel.
  const updated = await db
    .update(oauthGrants)
    .set(tokens.columns)
    .where(
      and(
        eq(oauthGrants.refreshHash, hashSecret(input.refreshToken)),
        eq(oauthGrants.clientId, input.clientId),
        isNull(oauthGrants.revokedAt),
        gt(oauthGrants.refreshExpiresAt, now),
      ),
    )
    .returning();
  if (updated.length === 0) {
    return { ok: false, error: "invalid_grant", description: "Obnovovací token neplatí. Pripoj sa znova." };
  }
  return { ok: true, body: tokenBody(tokens.access, tokens.refresh) };
}

export interface AccessGrant {
  grantId: string;
  userId: string;
  clientId: string;
  scope: string;
}

/**
 * Overenie prístupového tokenu pri každom volaní `/api/mcp`.
 *
 * `lastUsedAt` sa zapisuje najviac raz za päť minút — zápis pri každom
 * volaní nástroja by bol zbytočný a nastavenia potrebujú len hrubý údaj.
 */
export async function verifyAccessToken(token: string): Promise<AccessGrant | null> {
  if (!token.startsWith("tm_at_") || token.length > 200) return null;
  const db = await getDb();
  const now = new Date();
  // Token sám určuje používateľa — filtruje sa jeho odtlačkom.
  const rows = await db
    .select({
      id: oauthGrants.id,
      userId: oauthGrants.userId,
      clientId: oauthGrants.clientId,
      scope: oauthGrants.scope,
      lastUsedAt: oauthGrants.lastUsedAt,
    })
    .from(oauthGrants)
    .where(
      and(
        eq(oauthGrants.accessHash, hashSecret(token)),
        isNull(oauthGrants.revokedAt),
        gt(oauthGrants.accessExpiresAt, now),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;

  if (row.lastUsedAt === null || now.getTime() - row.lastUsedAt.getTime() > 5 * 60 * 1000) {
    await db
      .update(oauthGrants)
      .set({ lastUsedAt: now })
      .where(and(eq(oauthGrants.id, row.id), eq(oauthGrants.userId, row.userId)));
  }
  return { grantId: row.id, userId: row.userId, clientId: row.clientId, scope: row.scope };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRIPOJENÉ APLIKÁCIE (nastavenia)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ConnectedApp {
  id: string;
  clientName: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** Živé pripojenia — odpojené a tie, ktorým vypršal aj obnovovací token, nie. */
export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: oauthGrants.id,
      clientName: oauthClients.name,
      createdAt: oauthGrants.createdAt,
      lastUsedAt: oauthGrants.lastUsedAt,
    })
    .from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthGrants.clientId, oauthClients.id))
    .where(
      and(
        eq(oauthGrants.userId, userId),
        isNull(oauthGrants.revokedAt),
        gt(oauthGrants.refreshExpiresAt, new Date()),
      ),
    )
    .orderBy(desc(oauthGrants.createdAt));
  return rows;
}

export async function revokeConnectedApp(userId: string, grantId: string): Promise<boolean> {
  const db = await getDb();
  const updated = await db
    .update(oauthGrants)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthGrants.id, grantId), eq(oauthGrants.userId, userId), isNull(oauthGrants.revokedAt)))
    .returning();
  return updated.length > 0;
}

/** Klient, ktorý smie začať autorizáciu s touto adresou presmerovania. */
export async function clientForAuthorize(
  clientId: string,
  redirectUri: string,
): Promise<OAuthClient | null> {
  const client = await getClient(clientId);
  if (client === null) return null;
  return redirectMatches(client.redirectUris, redirectUri) ? client : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ŽIADOSŤ O AUTORIZÁCIU (/oauth/authorize)
   ═══════════════════════════════════════════════════════════════════════════ */

export type AuthorizeCheck =
  /** Zlý klient alebo adresa — nesmie sa presmerovať nikam, len ukázať chybu. */
  | { kind: "fatal"; message: string }
  /** Klient je v poriadku, ale žiadosť nie — chyba sa vráti klientovi. */
  | { kind: "redirect"; redirectUri: string; error: string; description: string; state: string | null }
  | {
      kind: "ok";
      client: OAuthClient;
      redirectUri: string;
      codeChallenge: string;
      state: string | null;
      resource: string | null;
    };

/**
 * Overenie parametrov autorizácie. Volá sa pri zobrazení súhlasu AJ pri
 * jeho odkliknutí — skryté polia formulára sa dajú prepísať, takže sa im
 * neverí o nič viac než adrese.
 */
export async function checkAuthorizeRequest(
  params: URLSearchParams,
  origin: string,
): Promise<AuthorizeCheck> {
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state");

  const client = await clientForAuthorize(clientId, redirectUri);
  if (client === null) {
    return {
      kind: "fatal",
      message:
        "Aplikácia, ktorá sa chce pripojiť, nie je zaregistrovaná alebo sa nezhoduje adresa návratu. Skús konektor v Claude pridať znova.",
    };
  }

  const fail = (error: string, description: string): AuthorizeCheck => ({
    kind: "redirect",
    redirectUri,
    error,
    description,
    state,
  });

  if (params.get("response_type") !== "code") {
    return fail("unsupported_response_type", "Podporovaný je len response_type=code.");
  }
  const challenge = params.get("code_challenge") ?? "";
  if (params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    return fail("invalid_request", "Chýba PKCE s metódou S256.");
  }
  const resource = params.get("resource");
  if (resource !== null && resource !== "" && resource !== mcpResource(origin)) {
    return fail("invalid_target", "Tento server vydáva prístup len k vlastnému /api/mcp.");
  }

  return {
    kind: "ok",
    client,
    redirectUri,
    codeChallenge: challenge,
    state,
    resource: resource !== null && resource !== "" ? resource : null,
  };
}
