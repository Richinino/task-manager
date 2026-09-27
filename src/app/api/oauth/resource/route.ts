import { corsPreflight, oauthJson } from "@/server/oauth-http";
import { originOf, protectedResourceMetadata } from "@/server/oauth";

/*
  Metadáta chráneného zdroja (RFC 9728) — na ne ukazuje hlavička
  `WWW-Authenticate` z `/api/mcp`. Verejne pod
  `/.well-known/oauth-protected-resource` (aj s `/api/mcp` na konci),
  prepis v `next.config.ts`.
*/

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return oauthJson(protectedResourceMetadata(originOf(request.headers, request.url)));
}

export function OPTIONS(): Response {
  return corsPreflight();
}
