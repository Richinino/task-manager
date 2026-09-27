import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PlugZap, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { withParams } from "@/lib/oauth";
import { redirectToClient } from "@/server/oauth-http";
import { getCurrentUser } from "@/server/auth-guard";
import { checkAuthorizeRequest, originOf } from "@/server/oauth";

import { approveAuthorization, denyAuthorization } from "./actions";

export const metadata: Metadata = {
  title: "Pripojiť aplikáciu",
  robots: { index: false, follow: false },
};

/*
  Obrazovka súhlasu pre MCP (docs/MCP.md).

  Sem pošle Claude človeka, keď v ňom pridá konektor. Kto nie je prihlásený,
  ide najprv na `/prihlasenie` a odtiaľ sa vráti presne sem. Súhlas je jediné
  miesto, kde vzniká prístup k dátam — registrácia klienta sama nič nesmie.

  Meno aplikácie si klient uvádza sám, preto sa ukazuje aj adresa, kam sa po
  povolení vrátiš: tá sa sfalšovať nedá a prezradí, kto naozaj žiada.
*/

interface AuthorizePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}

/** Skryté polia — súhlas ich odošle naspäť a akcia ich overí znova. */
function Hidden({ params }: { params: URLSearchParams }) {
  return (
    <>
      {[...params.entries()].map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
    </>
  );
}

export default async function AuthorizePage({ searchParams }: AuthorizePageProps) {
  const params = toParams(await searchParams);
  const origin = originOf(await headers());
  const check = await checkAuthorizeRequest(params, origin);

  if (check.kind === "redirect") {
    redirectToClient(
      withParams(check.redirectUri, {
        error: check.error,
        error_description: check.description,
        state: check.state ?? undefined,
      }),
    );
  }

  if (check.kind === "ok") {
    const user = await getCurrentUser();
    if (user === null) {
      redirect(`/prihlasenie?dalej=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`);
    }

    const returnHost = new URL(check.redirectUri).host;

    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-12">
        <div className="w-full max-w-[440px]">
          <p className="label mb-3 text-fg-muted">Task manažér</p>

          <div className="rounded border border-border bg-surface p-5">
            <div className="flex items-start gap-3">
              <PlugZap aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
              <div className="min-w-0">
                <h1 className="text-lg font-semibold tracking-tight break-words text-fg">
                  Pripojiť „{check.client.name}“?
                </h1>
                <p className="mt-1 text-body leading-relaxed text-fg-muted">
                  Aplikácia žiada o prístup k tvojim údajom v Task manažéri. Po povolení bude môcť:
                </p>
              </div>
            </div>

            <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-body leading-relaxed text-fg marker:text-fg-subtle">
              <li>čítať úlohy, udalosti, rozvrh, porady z kalendára a návyky,</li>
              <li>plánovať, odkladať, zahadzovať a odškrtávať úlohy a pridávať nové,</li>
              <li>vybrať prioritu dňa a uzavrieť ranný rituál.</li>
            </ul>

            <p className="mt-4 text-meta leading-relaxed text-fg-subtle">
              Natvrdo nezmaže nič. Prístup kedykoľvek zrušíš v Nastaveniach v časti Pripojené
              aplikácie.
            </p>

            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded border border-border bg-surface-2 px-3 py-2.5 text-meta">
              <dt className="text-fg-subtle">Prihlásený</dt>
              <dd className="min-w-0 break-words text-fg">{user.email}</dd>
              <dt className="text-fg-subtle">Návrat na</dt>
              <dd className="min-w-0 font-mono break-words text-fg">{returnHost}</dd>
            </dl>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <form action={denyAuthorization}>
                <Hidden params={params} />
                <Button type="submit" variant="secondary" className="w-full sm:w-auto">
                  Zamietnuť
                </Button>
              </form>
              <form action={approveAuthorization}>
                <Hidden params={params} />
                <Button type="submit" variant="primary" className="w-full sm:w-auto">
                  Povoliť
                </Button>
              </form>
            </div>
          </div>

          <p className="mt-4 text-center text-meta leading-relaxed text-fg-subtle">
            Meno aplikácie si uviedla sama. Povoľ len to, čo si práve sám pridal.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-12">
      <div
        role="alert"
        className="flex w-full max-w-[440px] items-start gap-2 rounded border border-border bg-surface px-4 py-3"
      >
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
        <div>
          <h1 className="text-body font-semibold text-fg">Pripojenie sa nedá dokončiť</h1>
          <p className="mt-1 text-body leading-relaxed text-fg-muted">{check.message}</p>
        </div>
      </div>
    </main>
  );
}
