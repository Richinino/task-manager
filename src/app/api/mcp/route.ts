import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { parseBearer } from "@/lib/oauth";
import { loadUser, runAsUser } from "@/server/auth-guard";
import { createMcpServer } from "@/server/mcp/server";
import { originOf, verifyAccessToken } from "@/server/oauth";

/*
  MCP server Task manažéra — Streamable HTTP bez stavu (docs/MCP.md).

  Každá požiadavka je samostatná: overí sa token, načíta sa používateľ,
  vznikne nový server s nástrojmi a po odpovedi zanikne. Na Verceli nič
  iné nejde — ďalšia požiadavka môže pristáť na inej inštancii funkcie.

  Bez platného tokenu vráti 401 s odkazom na metadáta (RFC 9728). Podľa
  neho si Claude sám nájde prihlásenie, zaregistruje sa a pošle človeka
  na obrazovku súhlasu.
*/

export const dynamic = "force-dynamic";
/** Prehľad dňa ťahá aj Google Kalendár — nech má rezervu. */
export const maxDuration = 60;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function unauthorized(origin: string, invalid: boolean): Response {
  const metadata = `${origin}/.well-known/oauth-protected-resource/api/mcp`;
  // Hlavička HTTP znesie len ASCII — slovenský text s diakritikou by zhodil odpoveď na 500.
  const challenge = invalid
    ? `Bearer error="invalid_token", error_description="The access token is invalid or expired", resource_metadata="${metadata}"`
    : `Bearer resource_metadata="${metadata}"`;
  return withCors(
    new Response(JSON.stringify({ error: invalid ? "invalid_token" : "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "WWW-Authenticate": challenge },
    }),
  );
}

async function handle(request: Request): Promise<Response> {
  const origin = originOf(request.headers, request.url);
  const token = parseBearer(request.headers.get("authorization"));
  if (token === null) return unauthorized(origin, false);

  const grant = await verifyAccessToken(token);
  if (grant === null) return unauthorized(origin, true);
  const user = await loadUser(grant.userId);
  if (user === null) return unauthorized(origin, true);

  return runAsUser(user, async () => {
    const server = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(request, {
        authInfo: { token, clientId: grant.clientId, scopes: [grant.scope], extra: { userId: user.id } },
      });
      return withCors(response);
    } catch (error) {
      console.error("[mcp] Požiadavka zlyhala:", error);
      return withCors(
        Response.json(
          { jsonrpc: "2.0", error: { code: -32603, message: "Interná chyba servera." }, id: null },
          { status: 500 },
        ),
      );
    } finally {
      await server.close();
    }
  });
}

export function POST(request: Request): Promise<Response> {
  return handle(request);
}

/*
  Server je bez stavu: nemá reláciu, ktorú by bolo treba zrušiť, ani
  otvorený prúd udalostí pre GET. Spec to dovoľuje odpovedať 405 — klient
  potom komunikuje len cez POST.
*/
function methodNotAllowed(): Response {
  return withCors(
    new Response(JSON.stringify({ error: "Bezstavový server — použi POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    }),
  );
}

export function GET(): Response {
  return methodNotAllowed();
}

export function DELETE(): Response {
  return methodNotAllowed();
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
