import type { Config } from "drizzle-kit";

/**
 * Migrácie sa generujú vždy proti Postgres dialektu — lokálny PGlite aj
 * produkčný Neon hovoria rovnakým jazykom, takže jedna sada migrácií stačí.
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/placeholder",
  },
  strict: true,
  verbose: true,
} satisfies Config;
