import type { Metadata } from "next";
import { LogIn, TriangleAlert } from "lucide-react";

import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Prihlásenie",
};

/** Chybové kódy, ktoré sem Auth.js vracia v query parametri `error`. */
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "Tento účet nemá prístup. Prihlás sa účtom, ktorý je v appke povolený.",
  Configuration:
    "Prihlásenie nie je správne nastavené. Skontroluj premenné v .env.local a reštartuj server.",
  Verification: "Odkaz na prihlásenie už neplatí. Skús to znova.",
  OAuthAccountNotLinked: "Tento e-mail je už priradený k inému spôsobu prihlásenia.",
};

async function signInWithGoogle(): Promise<void> {
  "use server";
  await signIn("google", { redirectTo: "/dnes" });
}

async function signInWithDevBypass(): Promise<void> {
  "use server";
  await signIn("dev", { redirectTo: "/dnes" });
}

export default async function PrihlaseniePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawError = params.error;
  const errorCode = Array.isArray(rawError) ? rawError[0] : rawError;
  const errorMessage = errorCode
    ? (ERROR_MESSAGES[errorCode] ?? "Prihlásenie zlyhalo. Skús to znova.")
    : null;

  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID);
  const devBypassEnabled =
    process.env.AUTH_DEV_BYPASS === "1" && process.env.NODE_ENV !== "production";
  const anyMethod = googleEnabled || devBypassEnabled;

  return (
    /*
      Návrh delí prihlásenie na dva stĺpce: vľavo 420 px s tým, čo tá appka
      vlastne sľubuje, vpravo samotné prihlásenie. Je to jediná obrazovka,
      ktorú človek uvidí skôr, než čokoľvek uvidí — a jediné miesto, kde sa
      dá povedať, prečo to má otvárať.

      Pod `md` ľavý stĺpec zmizne. Na telefóne sa prihlasuje ten, kto už vie,
      čo appka robí; celá obrazovka textu pred tlačidlom by bola prekážka.
    */
    <main className="flex min-h-dvh">
      <aside className="hidden w-[420px] shrink-0 flex-col border-r border-border bg-surface px-9 py-10 md:flex">
        <p className="label text-fg-muted">Task manažér</p>

        <div className="flex-1" />

        <div className="flex flex-col gap-3.5">
          <h2 className="text-pretty text-hero font-semibold leading-tight tracking-tight text-fg">
            Zoznam, ktorý nedáva pocit, že si pozadu.
          </h2>

          <ul className="flex flex-col gap-2.5">
            {[
              "Vynechaný deň je prázdne políčko, nie červená značka.",
              "Nič sa nepripomína dvakrát.",
              "Funguje aj bez signálu — zmeny sa odošlú samy.",
            ].map((veta) => (
              <li key={veta} className="flex items-start gap-2.5">
                <span aria-hidden="true" className="pt-0.5 font-mono text-meta text-accent">
                  —
                </span>
                <span className="text-pretty text-sm leading-relaxed text-fg-muted">
                  {veta}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex-1" />

        <p className="font-mono text-mini text-fg-subtle">
          Prihlásenie je len na to, aby si sa dostal k svojim údajom.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 items-center justify-center px-4 py-12 md:px-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6">
          <h1 className="text-lg font-semibold tracking-tight text-fg">Task manažér</h1>
          <p className="mt-1 text-body leading-relaxed text-fg-muted">
            Osobný systém na riadenie úloh a nápadov.
          </p>
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded border border-border bg-surface px-3 py-2.5"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
            <p className="text-body leading-relaxed text-fg">{errorMessage}</p>
          </div>
        ) : null}

        <div className="rounded border border-border bg-surface p-4">
          {anyMethod ? (
            <div className="flex flex-col gap-3">
              {googleEnabled ? (
                <form action={signInWithGoogle}>
                  <Button type="submit" variant="primary" className="w-full">
                    <LogIn className="size-4" />
                    Prihlásiť sa cez Google
                  </Button>
                </form>
              ) : null}

              {devBypassEnabled ? (
                <div className="flex flex-col gap-1.5">
                  {googleEnabled ? (
                    <div className="flex items-center gap-2 py-1">
                      <span className="h-px flex-1 bg-border" />
                      <span className="label text-fg-subtle">
                        alebo
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  ) : null}
                  <form action={signInWithDevBypass}>
                    <Button
                      type="submit"
                      variant="secondary"
                      className="w-full border-dashed text-fg-muted"
                    >
                      Pokračovať vo vývojovom režime
                    </Button>
                  </form>
                  <p className="text-meta leading-relaxed text-fg-subtle">
                    Dočasné riešenie. Funguje len mimo produkcie a vypneš ho
                    odstránením <code className="font-mono">AUTH_DEV_BYPASS</code> z
                    <code className="font-mono"> .env.local</code>.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-body font-medium text-fg">
                Nie je nastavený žiadny spôsob prihlásenia.
              </p>
              <p className="text-body leading-relaxed text-fg-muted">
                Do súboru <code className="font-mono">.env.local</code> doplň prihlásenie
                cez Google:
              </p>
              <pre className="overflow-x-auto rounded border border-border bg-surface-2 px-3 py-2 font-mono text-meta leading-relaxed text-fg-muted">
                {"AUTH_GOOGLE_ID=…\nAUTH_GOOGLE_SECRET=…"}
              </pre>
              <p className="text-body leading-relaxed text-fg-muted">
                alebo dočasné vývojové prihlásenie bez Googlu:
              </p>
              <pre className="overflow-x-auto rounded border border-border bg-surface-2 px-3 py-2 font-mono text-meta leading-relaxed text-fg-muted">
                {"AUTH_DEV_BYPASS=1"}
              </pre>
              <p className="text-meta leading-relaxed text-fg-subtle">
                Po zmene reštartuj <code className="font-mono">npm run dev</code>. Vzor
                všetkých premenných je v súbore{" "}
                <code className="font-mono">.env.example</code>.
              </p>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-meta text-fg-subtle">
          Prístup majú len povolené účty.
        </p>
      </div>
      </div>
    </main>
  );
}
