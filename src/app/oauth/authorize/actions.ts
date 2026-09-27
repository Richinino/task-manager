"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { withParams } from "@/lib/oauth";
import { redirectToClient } from "@/server/oauth-http";
import { getCurrentUser } from "@/server/auth-guard";
import { checkAuthorizeRequest, createAuthCode, originOf } from "@/server/oauth";

/*
  Odkliknutie súhlasu. Parametre prichádzajú zo skrytých polí formulára, takže
  sa overujú znova celé — rovnakou funkciou ako pri zobrazení.
*/

/** Polia, ktoré súhlas nesie ďalej. Iné sa ignorujú. */
const FIELDS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;

function paramsFrom(formData: FormData): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of FIELDS) {
    const value = formData.get(key);
    if (typeof value === "string" && value !== "") params.set(key, value);
  }
  return params;
}

export async function approveAuthorization(formData: FormData): Promise<void> {
  const origin = originOf(await headers());
  const params = paramsFrom(formData);
  const check = await checkAuthorizeRequest(params, origin);
  if (check.kind === "fatal") redirect(`/oauth/authorize?${params.toString()}`);
  if (check.kind === "redirect") {
    redirectToClient(
      withParams(check.redirectUri, {
        error: check.error,
        error_description: check.description,
        state: check.state ?? undefined,
      }),
    );
  }

  const user = await getCurrentUser();
  if (user === null) {
    redirect(`/prihlasenie?dalej=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`);
  }

  const code = await createAuthCode({
    clientId: check.client.id,
    userId: user.id,
    redirectUri: check.redirectUri,
    codeChallenge: check.codeChallenge,
    resource: check.resource,
  });

  redirectToClient(withParams(check.redirectUri, { code, state: check.state ?? undefined, iss: origin }));
}

export async function denyAuthorization(formData: FormData): Promise<void> {
  const origin = originOf(await headers());
  const params = paramsFrom(formData);
  const check = await checkAuthorizeRequest(params, origin);
  if (check.kind === "fatal") redirect("/dnes");
  redirectToClient(
    withParams(check.redirectUri, {
      error: "access_denied",
      error_description: "Prístup bol zamietnutý.",
      state: check.state ?? undefined,
    }),
  );
}
