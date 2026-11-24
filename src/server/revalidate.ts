import "server-only";

import { revalidatePath } from "next/cache";

/**
 * Obrazovky, ktoré ktorákoľvek zmena úlohy môže ovplyvniť.
 *
 * Žije mimo `actions/tasks.ts`, lebo modul s `"use server"` smie von vydávať
 * len asynchrónne akcie — a toto využívajú aj iné akcie (fokus).
 */
export const AFFECTED_PATHS = [
  "/dnes",
  "/tyzden",
  "/mesiac",
  "/inbox",
  // Odkladiská z M3: bez nich by sa zoznam po akcii z menu riadku neobnovil,
  // kým človek na obrazovku nepríde znova.
  "/niekedy",
  "/caka-sa-na",
  // Zmena úlohy mení počty aj postup projektu, takže sa dotýka aj štruktúry.
  "/projekty",
  "/oblasti",
  // Udalosti ukazujú postup prípravy (2/3) — odškrtnutie ho mení.
  "/udalosti",
] as const;

export function revalidateViews(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}
