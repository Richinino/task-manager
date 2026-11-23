import { parseBearer } from "@/lib/oauth";
import { loadUser, type CurrentUser } from "@/server/auth-guard";
import { verifyDeviceToken } from "@/server/device-tokens";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function unauthorized(): Response {
  return Response.json(
    { error: "Neplatný alebo zrušený token. Pripoj widget znova v Nastaveniach." },
    { status: 401, headers: NO_STORE },
  );
}

/** Používateľ z `Authorization: Bearer tm_dt_…`, alebo `null`. */
export async function widgetUser(request: Request): Promise<CurrentUser | null> {
  const token = parseBearer(request.headers.get("authorization"));
  if (token === null) return null;
  const userId = await verifyDeviceToken(token);
  if (userId === null) return null;
  return loadUser(userId);
}
