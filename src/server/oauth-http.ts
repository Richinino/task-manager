import "server-only";

import type { Route } from "next";
import { redirect } from "next/navigation";

/**
 * Odpovede OAuth koncových bodov.
 *
 * Metadáta, registrácia a výmena tokenov sa volajú aj z prehliadača (MCP
 * Inspector, webové klienty), preto majú otvorený CORS. Cookies sa v nich
 * nepoužívajú, takže otvorený CORS nič neprezradí — prihlásenie sa deje len
 * na obrazovke súhlasu, a tá CORS nemá.
 */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function oauthJson(
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Tokeny ani registrácia sa nesmú nikde odložiť (RFC 6749 §5.1).
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...CORS,
      ...extra,
    },
  });
}

export function oauthError(
  error: string,
  description: string,
  status = 400,
  extra: Record<string, string> = {},
): Response {
  return oauthJson({ error, error_description: description }, status, extra);
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * Presmerovanie mimo appky — na adresu klienta (`redirect_uri`).
 *
 * `typedRoutes` pozná len cesty appky a externú adresu by odmietol. Tá je
 * tu vždy overená: zhoduje sa so zaregistrovanou (`redirectMatches`), inak
 * by sa sem kód vôbec nedostal.
 */
export function redirectToClient(url: string): never {
  redirect(url as Route);
}
