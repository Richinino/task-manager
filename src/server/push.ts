import "server-only";

import webpush from "web-push";

import type { PushPayload } from "@/lib/push-payload";

/**
 * Odosielanie Web Push notifikácií.
 *
 * Šifrovanie správy a podpis VAPID rieši knižnica `web-push`. Ručne to tu
 * nerobíme zámerne: je to AES128GCM nad ECDH kľúčmi prehliadača plus JWT
 * podpísaný krivkou P-256, a chyba v tom sa neprejaví ako výnimka, ale ako
 * notifikácia, ktorá ticho nikdy nepríde.
 *
 * ## Kým nie sú kľúče, appka o notifikáciách mlčí
 *
 * `isPushConfigured()` je jediné miesto, kde sa to rozhoduje. Bez kľúčov
 * sa neponúkne ani prihlásenie v nastaveniach — ponúkať tlačidlo, ktoré
 * vždy zlyhá, je horšie než ho nemať.
 *
 * ## Mŕtve prihlásenie musí ísť von
 *
 * Keď človek odinštaluje appku alebo zmaže dáta stránky, push služba
 * odpovie 404 alebo 410. Taký riadok patrí zmazať — inak sa doň tlačí
 * donekonečna a každý beh plánovača si ho znova vypýta.
 */

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult =
  | { ok: true }
  /** `gone` znamená „toto prihlásenie už neplatí, zmaž ho". */
  | { ok: false; gone: boolean; error: string };

/** Kľúče z prostredia. Chýbajúci ktorýkoľvek znamená vypnuté notifikácie. */
function keys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;

  /*
    Predmet je kontakt na prevádzkovateľa — push služby ho vyžadujú, aby
    mali komu ohlásiť problém. `mailto:` aj `https:` sú platné; keď nie je
    nastavený, použije sa adresa appky, ktorú aj tak poznáme.
  */
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "mailto:noreply@localhost";

  return { publicKey, privateKey, subject };
}

/** Dá sa vôbec posielať? Podľa toho sa rozhoduje aj rozhranie v nastaveniach. */
export function isPushConfigured(): boolean {
  return keys() !== null;
}

/** Verejný kľúč pre prehliadač. `null`, keď notifikácie nie sú nastavené. */
export function pushPublicKey(): string | null {
  return keys()?.publicKey ?? null;
}

/**
 * Odošle jednu notifikáciu.
 *
 * Nikdy nevyhodí výnimku — plánovač prechádza desiatky prihlásení a jedno
 * pokazené nesmie zhodiť celý beh.
 */
export async function sendPush(
  subscription: PushSubscriptionRow,
  payload: PushPayload,
): Promise<PushResult> {
  const vapid = keys();
  if (vapid === null) {
    return { ok: false, gone: false, error: "Notifikácie nie sú nastavené." };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: vapid.subject,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey,
        },
        // Push služba správu podrží, kým je telefón offline — ale nie večne.
        // Pripomienka, ktorá dorazí o šesť hodín, už nie je pripomienka.
        TTL: 3600,
        urgency: "normal",
      },
    );
    return { ok: true };
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode: unknown }).statusCode)
        : 0;

    // 404 = endpoint neexistuje, 410 = prihlásenie bolo zrušené.
    const gone = status === 404 || status === 410;

    return {
      ok: false,
      gone,
      error: error instanceof Error ? error.message : "Odoslanie zlyhalo.",
    };
  }
}
