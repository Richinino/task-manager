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

/**
 * Zúženie pre klienta: je to zastavený odklad AJ so sprievodnými údajmi?
 *
 * `detail` sa overuje naozaj, nielen sľubuje. Sľúbiť ho a nekontrolovať by
 * znamenalo, že volajúci dostane `undefined` tam, kde mu typ hovorí `number` —
 * a keďže tá hodnota ide rovno do vety „Túto úlohu si už odložil N×",
 * prejavilo by sa to až prázdnym miestom v dialógu.
 */
export function isPostponeBlocked(
  result: { ok: boolean; error?: string; code?: string; detail?: unknown },
): result is ActionFailure & { detail: PostponeBlockedDetail } {
  if (result.ok !== false || result.code !== "postpone_blocked") return false;

  const detail = result.detail;
  return (
    typeof detail === "object" &&
    detail !== null &&
    typeof (detail as PostponeBlockedDetail).postponeCount === "number" &&
    typeof (detail as PostponeBlockedDetail).postponeBlockAt === "number"
  );
}
