/**
 * Návratový tvar serverových akcií.
 *
 * Žije v samostatnom module bez `"use server"` zámerne. Taký modul smie von
 * vydávať len asynchrónne funkcie, takže hoci `export type` prejde (typy sa
 * pri preklade vymažú), je čitateľnejšie mať spoločný tvar na jednom mieste,
 * odkiaľ si ho môžu vziať aj klientske komponenty.
 *
 * Akcie tento typ ďalej re-exportujú, aby existujúce importy z
 * `@/server/actions/*` ostali platné.
 */
export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? {} : { data: T }))
  | ActionFailure;

/**
 * Neúspech. `error` je veta pre používateľa — vždy prítomná, takže rozhranie,
 * ktoré `code` nepozná, má stále čo zobraziť.
 *
 * `code` dostávajú len tie zlyhania, na ktoré má rozhranie reagovať inak než
 * hláškou. Zatiaľ je jediné: odklad zastavený prahom. Bez kódu by ho klient
 * musel rozoznávať podľa textu hlášky, čo sa rozpadne pri prvej úprave textu.
 */
export interface ActionFailure {
  ok: false;
  error: string;
  code?: ActionErrorCode;
  /** Sprievodné údaje ku `code` — čo presne treba rozhodnúť. */
  detail?: PostponeBlockedDetail;
}

export type ActionErrorCode = "postpone_blocked";

export interface PostponeBlockedDetail {
  /** Koľkokrát je úloha odložená teraz. */
  postponeCount: number;
  /** Prah z nastavení, ktorý by tento odklad dovŕšil. */
  postponeBlockAt: number;
}

/** Zúženie pre klienta: je to zastavený odklad? */
export function isPostponeBlocked(
  result: { ok: boolean; code?: string; detail?: unknown },
): result is ActionFailure & { detail: PostponeBlockedDetail } {
  return result.ok === false && result.code === "postpone_blocked";
}
