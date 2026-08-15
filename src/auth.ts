import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { uuidv7 } from "@/lib/id";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const isProd = process.env.NODE_ENV === "production";

/**
 * Premenná prostredia, ktorá je prázdna alebo len z medzier, je NENASTAVENÁ.
 *
 * `.env` súbory bežne obsahujú `AUTH_SECRET=` ako miesto na doplnenie hodnoty.
 * To do `process.env` uloží prázdny reťazec, nie `undefined`, takže `??` sa
 * neuplatní a ďalej putuje `""` — Auth.js na ňom padne s `MissingSecret`.
 */
function env(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw === undefined || raw === "" ? undefined : raw;
}

/** Vývojové prihlásenie bez Googlu — v produkcii je tvrdo vypnuté. */
const devBypassEnabled = !isProd && env("AUTH_DEV_BYPASS") === "1";

const allowedEmail = env("ALLOWED_EMAIL")?.toLowerCase();

/** Google sa zaregistruje len s reálnym client id — prázdna hodnota je nenastavená. */
const googleClientId = env("AUTH_GOOGLE_ID");

/** Zaručí, že pre daný e-mail existuje riadok v `users`, a vráti jeho id. */
async function ensureUser(email: string, name?: string | null, image?: string | null) {
  const db = await getDb();
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return existing.id;

  const id = uuidv7();
  await db.insert(users).values({
    id,
    email,
    name: name ?? null,
    image: image ?? null,
    settings: DEFAULT_SETTINGS,
  });
  return id;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Bez adaptéra: session je JWT, vlastnú tabuľku `users` si spravujeme sami.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 90 },
  secret: env("AUTH_SECRET") ?? (isProd ? undefined : "dev-only-insecure-secret"),
  trustHost: true,
  pages: { signIn: "/prihlasenie" },

  providers: [
    ...(googleClientId !== undefined
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: env("AUTH_GOOGLE_SECRET"),
            authorization: {
              params: {
                // Kalendár len na čítanie (M8). Offline access kvôli refresh tokenu.
                scope:
                  "openid email profile https://www.googleapis.com/auth/calendar.readonly",
                access_type: "offline",
                prompt: "consent",
              },
            },
          }),
        ]
      : []),

    ...(devBypassEnabled
      ? [
          Credentials({
            id: "dev",
            name: "Vývojové prihlásenie",
            credentials: {},
            async authorize() {
              const email = allowedEmail ?? "dev@localhost";
              return { id: "dev", email, name: "Vývojár" };
            },
          }),
        ]
      : []),
  ],

  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      // Jednopoužívateľský systém: pustíme dnu iba povolený e-mail.
      if (allowedEmail && email !== allowedEmail) return false;
      return true;
    },

    async jwt({ token, user, account }) {
      if (user?.email) {
        token.uid = await ensureUser(user.email.toLowerCase(), user.name, user.image);
      }

      /*
        Tokeny ku Googlu prídu IBA v tomto callbacku a IBA pri prihlásení —
        potom sa `account` už nikdy neposiela. Ukladajú sa do `accounts`, nie
        do JWT: refresh token je dlhodobé poverenie k cudziemu účtu a v cookie
        nemá čo robiť. Podrobnosti v `server/google-tokens.ts`.

        Zlyhanie zápisu NESMIE zhodiť prihlásenie — kalendár je doplnok, nie
        podmienka vstupu do appky.
      */
      if (account?.provider === "google" && typeof token.uid === "string") {
        try {
          const { storeGoogleAccount } = await import("@/server/google-tokens");
          await storeGoogleAccount(token.uid, {
            providerAccountId: account.providerAccountId,
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            expires_at: account.expires_at,
            scope: account.scope,
          });
        } catch (error) {
          console.error("[auth] Tokeny ku Googlu sa nepodarilo uložiť:", error);
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
    };
  }
}
