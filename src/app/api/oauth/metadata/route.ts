import { corsPreflight, oauthJson } from "@/server/oauth-http";
import { authorizationServerMetadata, originOf } from "@/server/oauth";

/*
  Metadáta autorizačného servera (RFC 8414). Verejná adresa je
  `/.well-known/oauth-authorization-server` — prepis je v `next.config.ts`,
  lebo priečinky s bodkou Next v `app/` nevidí.
*/

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return oauthJson(authorizationServerMetadata(originOf(request.headers, request.url)));
}

export function OPTIONS(): Response {
  return corsPreflight();
}
