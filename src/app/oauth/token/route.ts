import { parseBasicAuth } from "@/lib/oauth";
import { corsPreflight, oauthError, oauthJson } from "@/server/oauth-http";
import { clientAuthenticates, exchangeCode, getClient, refreshGrant } from "@/server/oauth";

/*
  Výmena kódu za token a obnovenie tokenu (RFC 6749 §3.2, OAuth 2.1).

  Telo je štandardne `application/x-www-form-urlencoded`. JSON sa prijme
  tiež — niektorí klienti ho posielajú a odmietnuť ich by nič nezabezpečilo.
*/

export const dynamic = "force-dynamic";

async function readParams(request: Request): Promise<URLSearchParams | null> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const json: unknown = await request.json();
      if (json === null || typeof json !== "object") return null;
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(json)) {
        if (typeof value === "string") params.set(key, value);
      }
      return params;
    }
    return new URLSearchParams(await request.text());
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const params = await readParams(request);
  if (params === null) return oauthError("invalid_request", "Neplatné telo požiadavky.");

  const basic = parseBasicAuth(request.headers.get("authorization"));
  const clientId = basic?.id ?? params.get("client_id") ?? "";
  const secret = basic?.secret ?? params.get("client_secret");

  try {
    const client = await getClient(clientId);
    if (client === null || !clientAuthenticates(client, secret)) {
      return oauthError("invalid_client", "Klient sa nepodarilo overiť.", 401, {
        "WWW-Authenticate": 'Basic realm="task-manazer"',
      });
    }

    const grantType = params.get("grant_type");

    if (grantType === "authorization_code") {
      const code = params.get("code");
      const redirectUri = params.get("redirect_uri");
      const codeVerifier = params.get("code_verifier");
      if (code === null || redirectUri === null || codeVerifier === null) {
        return oauthError("invalid_request", "Chýba code, redirect_uri alebo code_verifier.");
      }
      const result = await exchangeCode({ code, clientId: client.id, redirectUri, codeVerifier });
      return result.ok ? oauthJson(result.body) : oauthError(result.error, result.description);
    }

    if (grantType === "refresh_token") {
      const refreshToken = params.get("refresh_token");
      if (refreshToken === null) return oauthError("invalid_request", "Chýba refresh_token.");
      const result = await refreshGrant({ refreshToken, clientId: client.id });
      return result.ok ? oauthJson(result.body) : oauthError(result.error, result.description);
    }

    return oauthError("unsupported_grant_type", "Podporované sú authorization_code a refresh_token.");
  } catch (error) {
    console.error("[oauth] Výmena tokenu zlyhala:", error);
    return oauthError("server_error", "Token sa nepodarilo vydať.", 500);
  }
}

export function OPTIONS(): Response {
  return corsPreflight();
}
