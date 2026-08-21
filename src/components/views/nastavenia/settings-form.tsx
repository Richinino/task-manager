"use client";

import { useId, useRef, useState, useTransition } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import type { Settings } from "@/lib/settings";
import { rulesToText, textToRules } from "@/lib/auto-tag";
import { placesToText } from "@/lib/places";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { savePlaces, updateSettings } from "@/server/actions/settings";

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
    <section>
      <Card className="flex flex-col gap-3">
        <CardHeader title={title} description={description} />
        <div className="flex flex-col gap-4">{children}</div>
      </Card>
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
      <label htmlFor={id} className="text-body font-medium text-fg">
        {label}
      </label>
      {children}
      {hint ? <p className="text-meta leading-relaxed text-fg-subtle">{hint}</p> : null}
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
  /*
    Pravidlá majú vlastný rozpracovaný text: prevod tam a späť by pri každom
    písmene prehádzal medzery a poradie, a človeku by pod rukami skákal kurzor.
    Ukladá sa až pri opustení poľa.
  */
  const [rulesText, setRulesText] = useState(() => rulesToText(settings.autoTagRules));
  const [placesText, setPlacesText] = useState(() => placesToText(settings.places));
  /*
    Miesta majú vlastný stav ukladania, lebo ako jediné potrebujú sieť:
    adresa sa prekladá na súradnice a to trvá sekundu na každú novú. Bez
    viditeľného „prekladám" vyzerá pole tak, že sa nič nedeje.
  */
  const [placesBusy, setPlacesBusy] = useState(false);
  /** Adresy, ktoré služba nenašla — neuložili sa a treba ich opraviť. */
  const [unresolved, setUnresolved] = useState<string[]>([]);
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
   * Uloží miesta. Ide vlastnou cestou, nie cez `commit`, lebo adresy sa
   * musia najprv preložiť na súradnice — a to je jediná vec v nastaveniach,
   * ktorá siaha na sieť a môže sa čiastočne nepodariť.
   *
   * Text sa po uložení **neprepisuje** podľa toho, čo prešlo. Nenájdená
   * adresa sa medzi miesta nedostane, takže prepis by ten riadok človeku
   * zmazal spod rúk — namiesto toho ostane, kde bol, a je pri ňom napísané,
   * že sa nenašiel.
   */
  function commitPlaces(): void {
    if (placesText === placesToText(savedRef.current.places)) {
      setUnresolved([]);
      return;
    }

    setError(null);
    setPlacesBusy(true);

    startTransition(async () => {
      try {
        const result = await savePlaces(placesText);
        if (result.ok) {
          savedRef.current = result.data.settings;
          setDraft(result.data.settings);
          setUnresolved(result.data.unresolved);
        } else {
          setError(result.error);
        }
      } catch {
        setError("Miesta sa nepodarilo uložiť.");
      } finally {
        setPlacesBusy(false);
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
        className={"w-28"}
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
        <SelectTrigger id={fieldId(key)} className={"w-28"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
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
          <p className="flex items-start gap-2 text-body leading-relaxed text-danger">
            <TriangleAlert aria-hidden="true" size={16} className="mt-px shrink-0" />
            <span className="min-w-0">{error}</span>
          </p>
        ) : isPending ? (
          <p className="flex items-center gap-1.5 text-body text-fg-subtle">
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
            <SelectTrigger id={fieldId("weekStartsOn")} className={"w-40"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
        title="Miesta"
        description="Spájajú kontext s adresou. Vďaka nim vie „Čo teraz?“ po stlačení „Som tu“ zistiť, kde si, a ponúknuť úlohy pre to miesto."
      >
        <Field
          id={fieldId("places")}
          label="Miesta a ich adresy"
          hint="Riadok na miesto, v tvare „kontext = adresa“. Adresa sa pri uložení raz preloží na súradnice cez OpenStreetMap — je to jediná vec, ktorá pri tom odchádza von, a odchádza len samotná adresa. Ak už súradnice máš, môžeš ich napísať namiesto adresy. Poloha sa číta len vtedy, keď o to sám požiadaš — appka ťa na pozadí nesleduje a webová stránka to ani nevie."
        >
          <Textarea
            id={fieldId("places")}
            value={placesText}
            onChange={(event) => setPlacesText(event.target.value)}
            onBlur={commitPlaces}
            rows={3}
            spellCheck={false}
            placeholder={"domino = Trnavská cesta 100, Bratislava\npraca = Einsteinova 25, Bratislava"}
            // Strojopis nie je ozdoba: riadky „kľúč = hodnota" sa pod sebou
            // zarovnajú a preklep je vidieť na prvý pohľad.
            className="font-mono"
          />

          {placesBusy ? (
            <p role="status" className="flex items-center gap-1.5 text-meta text-fg-muted">
              <LoaderCircle aria-hidden="true" size={13} className="animate-spin" />
              Prekladám adresy na súradnice…
            </p>
          ) : null}

          {/* Nenájdená adresa sa neuloží — bez súradníc by sa nikdy
              nezhodovala a miesto by ticho nefungovalo. */}
          {!placesBusy && unresolved.length > 0 ? (
            <p role="status" className="flex items-start gap-1.5 text-meta text-danger">
              <TriangleAlert aria-hidden="true" size={13} className="mt-0.5 shrink-0" />
              <span>
                Tieto adresy sa nepodarilo nájsť a neuložili sa:{" "}
                <span className="font-medium">{unresolved.join(" · ")}</span>. Skús ich
                napísať presnejšie, aj s mestom.
              </span>
            </p>
          ) : null}
        </Field>
      </Section>

      <Section
        title="Automatické štítky"
        description="Keď názov obsahuje slovo vľavo, zachytenie ponúkne značky vpravo. Ponúkne — nedoplní: kliknutie je na tebe."
      >
        <Field
          id={fieldId("autoTagRules")}
          label="Pravidlá"
          hint="Riadok na pravidlo, v tvare „slovo = #štítok @kontext“. Na diakritike ani veľkosti písmen nezáleží a slovo sa hľadá aj v skloňovaných tvaroch."
        >
          <Textarea
            id={fieldId("autoTagRules")}
            value={rulesText}
            onChange={(event) => setRulesText(event.target.value)}
            onBlur={() => {
              const next = textToRules(rulesText);
              // Prepisuje sa len pri skutočnej zmene — inak by opustenie poľa
              // posielalo zápis pri každom preklikaní.
              if (JSON.stringify(next) === JSON.stringify(savedRef.current.autoTagRules)) {
                return;
              }
              commit({ autoTagRules: next });
            }}
            rows={4}
            spellCheck={false}
            placeholder={"trening = #trening @domino\nfaktura = #financie"}
            className="font-mono"
          />
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
            <SelectTrigger id={fieldId("timezone")} className={"w-56"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
