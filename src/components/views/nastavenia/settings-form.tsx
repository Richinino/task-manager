"use client";

import { useId, useRef, useState, useTransition } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import type { Settings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateSettings } from "@/server/actions/settings";

/* ═══════════════════════════════════════════════════════════════════════════
   NASTAVENIA

   Rovnaké pravidlá ako v detaile projektu: žiadne tlačidlo „Uložiť". Každá
   zmena sa ukladá sama a keď server odmietne, pole sa vráti na poslednú
   potvrdenú hodnotu a povie sa prečo.

   Čísla sa ukladajú pri opustení poľa, výbery hneď pri zmene. Krížové
   kontroly (koniec dňa po jeho začiatku, prah blokovania nad prahom
   upozornenia) beží server — tu sa len zobrazí, čo odmietol.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Rovnaký tvar ako `ActionResult<Settings>`, len bez väzby na „use server". */
type SaveResult = { ok: true; data: Settings } | { ok: false; error: string };

const controlClass = "h-11 text-base sm:h-9 sm:text-sm";
const selectContentClass = "[&_[role=option]]:h-11 sm:[&_[role=option]]:h-8";

/**
 * Pásma, ktoré dávajú zmysel ponúknuť. Zoznam je krátky zámerne — appka má
 * jediného používateľa a úplný výber z vyše štyristo pásiem by bol na výber
 * horší, nie lepší. Uložiť sa dá aj iné (server overuje, či existuje), len
 * sa k nemu treba dostať cez API.
 */
const TIME_ZONES = [
  "Europe/Bratislava",
  "Europe/Prague",
  "Europe/Vienna",
  "Europe/London",
  "Europe/Kyiv",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "UTC",
] as const;

const WEEK_DAYS: { value: number; label: string }[] = [
  { value: 1, label: "Pondelok" },
  { value: 0, label: "Nedeľa" },
  { value: 6, label: "Sobota" },
];

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

const HOURS = Array.from({ length: 25 }, (_, hour) => hour);

/* ── stavebné kamene ──────────────────────────────────────────────────────── */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-fg">{title}</h2>
        <p className="text-[13px] leading-relaxed text-fg-muted">{description}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] leading-relaxed text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

/* ── formulár ─────────────────────────────────────────────────────────────── */

export interface SettingsFormProps {
  settings: Settings;
}

export function SettingsForm({ settings }: SettingsFormProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  /** Posledný stav potvrdený serverom — sem sa formulár vracia pri odmietnutí. */
  const savedRef = useRef<Settings>(settings);

  const ids = useId();
  const fieldId = (field: string): string => `${ids}-${field}`;

  /**
   * Prekreslí hneď, uloží na pozadí. Keď server odmietne, vráti sa celý
   * rozpracovaný stav — nastavenia sa overujú krížom, takže vrátiť len jedno
   * pole by mohlo nechať formulár v kombinácii, ktorú server nikdy neprijal.
   */
  function commit(changes: Partial<Settings>): void {
    setDraft((previous) => ({ ...previous, ...changes }));
    setError(null);

    startTransition(async () => {
      const revert = (message: string): void => {
        setDraft(savedRef.current);
        setError(message);
      };

      try {
        const result: SaveResult = await updateSettings(changes);
        if (result.ok) {
          savedRef.current = result.data;
          setDraft(result.data);
          return;
        }
        revert(result.error);
      } catch {
        revert("Nastavenie sa nepodarilo uložiť.");
      }
    });
  }

  /**
   * Číselné pole sa ukladá až pri opustení. Počas písania by medzistav („1"
   * na ceste k „12") prešiel validáciou a uložil sa ako platná hodnota.
   */
  function commitNumber(key: keyof Settings, raw: string, current: number): void {
    const next = Number.parseInt(raw, 10);
    if (Number.isNaN(next) || next === current) {
      setDraft((previous) => ({ ...previous, [key]: current }));
      return;
    }
    commit({ [key]: next } as Partial<Settings>);
  }

  function numberField(
    key: "wipLimit" | "postponeWarnAt" | "postponeBlockAt" | "incubatorAfterDays" | "fadeAfterDays",
    min: number,
    max: number,
  ) {
    return (
      <Input
        id={fieldId(key)}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        className={cn(controlClass, "w-28")}
        value={String(draft[key])}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft((previous) => ({
            ...previous,
            [key]: raw === "" ? previous[key] : Number.parseInt(raw, 10),
          }));
        }}
        onBlur={(event) => commitNumber(key, event.target.value, savedRef.current[key])}
      />
    );
  }

  function hourField(key: "dayStartHour" | "dayEndHour") {
    return (
      <Select
        value={String(draft[key])}
        onValueChange={(value) => commit({ [key]: Number.parseInt(value, 10) })}
      >
        <SelectTrigger id={fieldId(key)} className={cn(controlClass, "w-28")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={selectContentClass}>
          {HOURS.map((hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {hourLabel(hour)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        Hlásenie o zlyhaní patrí nad formulár: chyba je krížová (týka sa dvoch
        polí naraz), takže ju nemá kam prilepiť jedno pole.
      */}
      <div aria-live="polite" className="min-h-5">
        {error ? (
          <p className="flex items-start gap-2 text-[13px] leading-relaxed text-danger">
            <TriangleAlert aria-hidden="true" size={16} className="mt-px shrink-0" />
            <span className="min-w-0">{error}</span>
          </p>
        ) : isPending ? (
          <p className="flex items-center gap-1.5 text-[13px] text-fg-subtle">
            <LoaderCircle aria-hidden="true" size={14} className="animate-spin" />
            Ukladám…
          </p>
        ) : null}
      </div>

      <Section
        title="Deň"
        description="Koľko času máš a koľko úloh doň pustíš. Z týchto čísel sa počíta rozpočet na obrazovke „Dnes“."
      >
        <div className="flex flex-wrap gap-4">
          <Field id={fieldId("dayStartHour")} label="Začiatok dňa">
            {hourField("dayStartHour")}
          </Field>
          <Field
            id={fieldId("dayEndHour")}
            label="Koniec dňa"
            hint="Musí byť neskôr než začiatok."
          >
            {hourField("dayEndHour")}
          </Field>
        </div>

        <Field
          id={fieldId("wipLimit")}
          label="Limit úloh na deň"
          hint="Nad týmto počtom sa na „Dnes“ objaví upozornenie. Nebráni ti — len ti to povie."
        >
          {numberField("wipLimit", 1, 20)}
        </Field>

        <Field id={fieldId("weekStartsOn")} label="Týždeň začína">
          <Select
            value={String(draft.weekStartsOn)}
            onValueChange={(value) => commit({ weekStartsOn: Number.parseInt(value, 10) })}
          >
            <SelectTrigger id={fieldId("weekStartsOn")} className={cn(controlClass, "w-40")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              {WEEK_DAYS.map((day) => (
                <SelectItem key={day.value} value={String(day.value)}>
                  {day.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section
        title="Odkladanie"
        description="Koľkokrát smieš úlohu posunúť, kým sa ťa appka spýta, čo s ňou naozaj chceš spraviť."
      >
        <Field
          id={fieldId("postponeWarnAt")}
          label="Upozorniť po"
          hint="Od tohto počtu odkladov svieti pri úlohe žltý odznak."
        >
          {numberField("postponeWarnAt", 1, 50)}
        </Field>

        <Field
          id={fieldId("postponeBlockAt")}
          label="Zastaviť po"
          hint="Odklad, ktorý dovŕši tento počet, prejde len s dôvodom. Musí byť vyššie než upozornenie."
        >
          {numberField("postponeBlockAt", 2, 99)}
        </Field>
      </Section>

      <Section
        title="Nápady"
        description="Ako dlho nechať nápad ležať, kým sa pripomenie a kým vybledne."
      >
        <Field
          id={fieldId("incubatorAfterDays")}
          label="Do inkubátora po (dní)"
          hint="Nedotknutý nápad sa po tomto čase objaví medzi pripomenutiami."
        >
          {numberField("incubatorAfterDays", 1, 3650)}
        </Field>

        <Field
          id={fieldId("fadeAfterDays")}
          label="Vybledne po (dní)"
          hint="Stále je v hre — dotyk ho vráti späť. Musí byť viac než inkubátor."
        >
          {numberField("fadeAfterDays", 30, 3650)}
        </Field>
      </Section>

      <Section
        title="Čas a miesto"
        description="Podľa pásma sa určuje, ktorý deň je „dnes“. Mení sa aj to, čo appka považuje za prešvihnuté."
      >
        <Field id={fieldId("timezone")} label="Časové pásmo">
          <Select
            value={draft.timezone}
            onValueChange={(value) => commit({ timezone: value })}
          >
            <SelectTrigger id={fieldId("timezone")} className={cn(controlClass, "w-56")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={selectContentClass}>
              {/*
                Uložené pásmo nemusí byť v zozname (dá sa nastaviť aj mimo neho).
                Bez doplnenia by výber ukázal prázdno a prvá zmena čohokoľvek
                iného by pásmo ticho prepísala.
              */}
              {(TIME_ZONES as readonly string[]).includes(draft.timezone)
                ? null
                : (
                    <SelectItem value={draft.timezone}>{draft.timezone}</SelectItem>
                  )}
              {TIME_ZONES.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>
    </div>
  );
}
