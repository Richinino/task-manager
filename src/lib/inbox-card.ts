import { formatRelativeSk } from "@/lib/dates";

/** Vzdialenosť potiahnutia karty, od ktorej gesto platí. */
export const INBOX_SWIPE_PX = 90;

/** Doprava = Dnes, doľava = Niekedy; kratšie potiahnutie nerozhoduje nič. */
export function swipeTarget(dx: number): "today" | "someday" | null {
  if (dx >= INBOX_SWIPE_PX) return "today";
  if (dx <= -INBOX_SWIPE_PX) return "someday";
  return null;
}

/**
 * „pridané dnes 8:47" · „pridané včera 21:03" · „pridané 12. aug 7:30".
 *
 * Deň a čas sa berú v pásme používateľa, nie prehliadača — inak by sa karta
 * pri hydratácii rozišla so serverom.
 */
export function addedLabel(createdAt: Date, todayIso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(createdAt);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  const iso = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = String(Number(get("hour")));
  const when = formatRelativeSk(iso, new Date(`${todayIso}T12:00:00`));
  return `pridané ${when} ${hour}:${get("minute")}`;
}
