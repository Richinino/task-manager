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
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[22rem]">
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
                      <span className="text-mini uppercase tracking-wide text-fg-subtle">
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
    </main>
  );
}
