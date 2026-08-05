import { handlers } from "@/auth";

// PGlite aj node-postgres potrebujú Node runtime, nie edge.
export const runtime = "nodejs";

export const { GET, POST } = handlers;
