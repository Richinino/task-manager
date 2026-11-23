"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/server/action-result";
import { requireUser } from "@/server/auth-guard";
import { createDeviceToken, revokeDeviceToken } from "@/server/device-tokens";

/** Spáruje widget: vytvorí token, ktorý sa vráti jediný raz v čistej podobe. */
export async function pairWidget(): Promise<ActionResult<{ token: string }>> {
  const user = await requireUser();
  try {
    const token = await createDeviceToken(user.id, "Widget v telefóne");
    revalidatePath("/nastavenia");
    return { ok: true, data: { token } };
  } catch (error) {
    console.error("[widget] Párovanie zlyhalo:", error);
    return { ok: false, error: "Widget sa nepodarilo pripojiť. Skús to znova." };
  }
}

export async function revokeWidget(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (typeof id !== "string" || id === "" || id.length > 64) {
    return { ok: false, error: "Chýba identifikátor widgetu." };
  }
  try {
    await revokeDeviceToken(user.id, id);
    revalidatePath("/nastavenia");
    return { ok: true };
  } catch (error) {
    console.error("[widget] Odpojenie zlyhalo:", error);
    return { ok: false, error: "Widget sa nepodarilo odpojiť. Skús to znova." };
  }
}
