import "server-only";

/**
 * Serverový vstup do databázy. `server-only` zaručí, že sa spojenie
 * nikdy neomylom nezabalí do klientského bundlu.
 */
export { getDb, schema, type Database } from "./client";
