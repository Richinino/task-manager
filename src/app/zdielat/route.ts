import { NextResponse, type NextRequest } from "next/server";

import { buildCaptureHref, joinSharedText } from "@/lib/capture-link";

/**
 * Cieľ zdieľania z Androidu (manifest `share_target`, GET).
 * Spojí title/text/url do jedného textu a presmeruje na rýchle zachytenie.
 * Neprihláseného používateľa si potom prevezme bežný prihlasovací tok.
 */
export function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const text = joinSharedText({
    title: p.get("title"),
    text: p.get("text"),
    url: p.get("url"),
  });
  return NextResponse.redirect(new URL(buildCaptureHref(text), request.url), 307);
}
