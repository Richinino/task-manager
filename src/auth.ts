import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { DEFAULT_AREAS } from "@/db/default-areas";
import { areas, users } from "@/db/schema";
import { isAllowed, parseAllowList } from "@/lib/allowlist";
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

/**
 * Kto smie dnu — zoznam e-mailov oddelených čiarkou v `ALLOWED_EMAILS`.
 *
 * Kým bol systém jednopoužívateľský, stačila jedna hodnota v `ALLOWED_EMAIL`.
 * Ten názov ostáva ako záloha, aby sa nasadenie nerozbilo skôr, než sa na
 * Verceli premenná premenuje.
 *
 * Samotné rozhodovanie žije v `@/lib/allowlist` a má testy — je to jediná
 * zábrana pri vstupe a jej zlyhanie by nebolo vidieť.
 */
const allowedEmails = parseAllowList(env("ALLOWED_EMAILS") ?? env("ALLOWED_EMAIL"));

/** Prvý zo zoznamu — potrebuje ho len vývojové prihlásenie. */
const primaryEmail = [...allowedEmails][0];

/** Google sa zaregistruje len s reálnym client id — prázdna hodnota je nenastavená. */
const googleClientId = env("AUTH_GOOGLE_ID");

/**
 * Založí novému používateľovi predvolené oblasti.
 *
 * Zlyhanie sa **prehltne**: appka bez oblastí je chudobnejšia, ale funguje,
 * kým appka, do ktorej sa nedá prihlásiť, nie je na nič. Je to ten istý
 * kompromis, aký už platí pre ukladanie tokenov ku Googlu nižšie.
 */
async function seedDefaultAreas(userId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(areas).values(
      DEFAULT_AREAS.map((area, index) => ({
        id: uuidv7(),
        userId,
        name: area.name,
        color: area.color,
        icon: area.icon,
        sort: index,
      })),
    );
  } catch (error) {
    console.error("[auth] Predvolené oblasti sa nepodarilo založiť:", error);
  }
}

/** Zaručí, že pre daný e-mail existuje riadok v `users`, a vráti jeho id. */
async function ensureUser(email: string, name?: string | null, image?: string | null) {
  const db = await getDb();
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return existing.id;

  const id = uuidv7();
  /*
    `onConflictDoNothing` a dohľadanie namiesto holého `insert`: `users.email`
    má UNIQUE a dve súbežné prvé prihlásenia (dve karty, dvojklik na tlačidlo)
    by inak zhodili prihlásenie na porušení unikátnosti — práve to prvé, ktoré
    má človek zažiť.
  */
  await db
    .insert(users)
    .values({
      id,
      email,
      name: name ?? null,
      image: image ?? null,
      settings: DEFAULT_SETTINGS,
    })
    .onConflictDoNothing();

  const created = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!created) throw new Error("Používateľa sa nepodarilo založiť.");

  // Oblasti len k riadku, ktorý sme naozaj vložili my. Pri súbehu vyhral
  // niekto iný a ten si ich založil sám — inak by ich nový človek mal dvakrát.
  if (created.id === id) await seedDefaultAreas(created.id);

  return created.id;
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
              const email = primaryEmail ?? "dev@localhost";
              return { id: "dev", email, name: "Vývojár" };
            },
          }),
        ]
      : []),
  ],

  callbacks: {
    async signIn({ user }) {
      // Prázdny zoznam znamená v produkcii „nikto" — podrobnosti aj testy
      // sú v `@/lib/allowlist`.
      return isAllowed(user.email ?? "", allowedEmails, isProd);
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
