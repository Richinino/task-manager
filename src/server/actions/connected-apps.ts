"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/server/auth-guard";
import { revokeConnectedApp } from "@/server/oauth";

/**
 * Odpojenie aplikácie pripojenej cez MCP (Claude a pod.).
 *
 * Prístupový aj obnovovací token prestanú platiť v tej istej chvíli — Claude
 * pri ďalšom volaní dostane 401 a musí sa pripojiť znova, so súhlasom.
 */
export async function disconnectApp(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("id");
  if (typeof id !== "string" || id === "" || id.length > 64) return;
  await revokeConnectedApp(user.id, id);
  revalidatePath("/nastavenia");
}
