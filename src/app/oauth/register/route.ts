import { corsPreflight, oauthError, oauthJson } from "@/server/oauth-http";
import { registerClient } from "@/server/oauth";

/*
  Dynamická registrácia klienta (RFC 7591). Claude sa tu zaregistruje sám,
  keď v ňom pridáš konektor — nič netreba vypĺňať ručne.

  Registrácia je otvorená zámerne: zaregistrovaný klient nesmie nič, kým
  mu prihlásený človek neodklikne súhlas.
*/

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "Telo registrácie musí byť JSON.");
  }

  try {
    const result = await registerClient(body);
    if (!result.ok) return oauthError(result.error, result.description);
    return oauthJson(result.body, 201);
  } catch (error) {
    console.error("[oauth] Registrácia klienta zlyhala:", error);
    return oauthError("server_error", "Registrácia sa nepodarila.", 500);
  }
}

export function OPTIONS(): Response {
  return corsPreflight();
}
