"use server";

import { z } from "zod";

import { minutesIn, parseIsoDate, todayIn, toIsoDate } from "@/lib/dates";
import { type DayTimeline, layoutDay } from "@/lib/day-timeline";
import type { ActionResult } from "@/server/action-result";
import { requireUser } from "@/server/auth-guard";
import { getDayTimelineInput } from "@/server/queries/day-timeline";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dátum musí byť v tvare RRRR-MM-DD.")
  // `2026-02-31` prejde výrazom, ale po prevode tam a späť vyjde iný deň.
  .refine((value) => toIsoDate(parseIsoDate(value)) === value, "Neplatný dátum.");

/** Časová os daného dňa. „Teraz" sa pridá len pre dnešok v pásme používateľa. */
export async function loadDayTimeline(dateIso: string): Promise<ActionResult<DayTimeline>> {
  const parsed = dateSchema.safeParse(dateIso);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Neplatný dátum." };
  }

  const user = await requireUser();
  const { timezone, dayStartHour, dayEndHour } = user.settings;

  const base = await getDayTimelineInput(
    user.id,
    parsed.data,
    timezone,
    dayStartHour,
    dayEndHour,
  );
  const nowMin = parsed.data === todayIn(timezone) ? minutesIn(timezone) : null;

  return { ok: true, data: layoutDay({ ...base, nowMin }) };
}
