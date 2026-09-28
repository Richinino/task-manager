import { hhmm, isAgendaReminder, isAssessment, type AgendaKind, type AgendaType } from "@/lib/agenda";
import { addDays, diffDays } from "@/lib/dates";
import { fold } from "@/lib/fold";
import type { AgendaInput } from "@/server/actions/agenda";
import type { UpdateTaskPatch } from "@/server/actions/tasks";

/*
  Úpravy cez MCP — čistá logika, bez databázy (docs/MCP.md).

  Model pozná mená, nie identifikátory, a posiela len to, čo sa má zmeniť.
  Tu sa z toho skladá presne to, čo čakajú serverové akcie appky: meno
  projektu → jeho id, záplata úlohy s rozdielom „nechaj“ (`undefined`)
  a „vymaž“ (`null`), celý formulár udalosti z uloženej udalosti a zmien.
  Zapisuje sa až v `server.ts`, cez tie isté akcie ako tlačidlá.

  Chybové hlášky sú po slovensky ako v appke; pokyn pre model, čo s nimi
  robiť, je po anglicky ako popisy nástrojov.
*/

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Porovnanie mien: bez ohľadu na veľkosť písmen a diakritiku. */
function key(text: string): string {
  return fold(text.trim().toLowerCase());
}

/** Prázdny text je „vymaž“, nie prázdny reťazec v databáze. */
function blank(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  return text.trim() === "" ? null : text;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MENÁ → ID
   ═══════════════════════════════════════════════════════════════════════════ */

export type NamedKind = "project" | "area" | "subject";

export interface NamedOption {
  id: string;
  /** Meno; pri predmete skratka (`MAT`). */
  name: string;
  /** Druhé platné meno — pri predmete celý názov („Matematika“). */
  alt?: string | null;
}

const NAMED: Record<NamedKind, { notFound: (q: string) => string; valid: string; empty: string }> = {
  project: {
    notFound: (q) => `Projekt „${q}“ sa nenašiel.`,
    valid: "Aktívne projekty",
    empty: "Nemáš žiadny aktívny projekt — zakladá sa v appke.",
  },
  area: {
    notFound: (q) => `Oblasť „${q}“ sa nenašla.`,
    valid: "Oblasti",
    empty: "Nemáš žiadnu oblasť — zakladá sa v appke.",
  },
  subject: {
    notFound: (q) => `Predmet „${q}“ sa nenašiel.`,
    valid: "Predmety",
    empty: "Nemáš žiadny predmet — pridávajú sa v Rozvrhu.",
  },
};

function optionLabel(option: NamedOption): string {
  return option.alt ? `${option.name} (${option.alt})` : option.name;
}

/**
 * Projekt, oblasť alebo predmet podľa mena (alebo id) z výstupu nástrojov.
 *
 * Len presná zhoda — bez diakritiky a veľkosti písmen, ale nič sa
 * nedomýšľa, rovnako ako pri predmete v názve úlohy (`matchSubject`).
 * Keď nesedí nič, hláška vymenuje platné mená, aby model vedel skúsiť
 * znova. `null` aj prázdne meno znamená „odober“.
 */
export function resolveNamed(
  kind: NamedKind,
  input: string | null,
  options: readonly NamedOption[],
): Result<{ id: string | null }> {
  if (input === null) return { ok: true, id: null };
  const raw = input.trim().replace(/^\+/u, "").trim();
  if (raw === "") return { ok: true, id: null };

  const byId = options.find((option) => option.id === raw);
  if (byId !== undefined) return { ok: true, id: byId.id };

  const needle = key(raw);
  const hits = options.filter(
    (option) => key(option.name) === needle || (option.alt ? key(option.alt) === needle : false),
  );
  if (hits.length === 1) return { ok: true, id: hits[0]!.id };

  const texts = NAMED[kind];
  if (hits.length > 1) {
    return {
      ok: false,
      error: `„${raw}“ sedí na viac položiek: ${hits.map((h) => `${optionLabel(h)} [${h.id}]`).join(", ")}. Send the id instead of the name.`,
    };
  }
  if (options.length === 0) return { ok: false, error: `${texts.notFound(raw)} ${texts.empty}` };
  return {
    ok: false,
    error: `${texts.notFound(raw)} ${texts.valid}: ${options.map(optionLabel).join(", ")}. Use one of these names exactly, or null to remove it.`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ÚLOHA
   ═══════════════════════════════════════════════════════════════════════════ */

/** Vstup `update_task` bez id a mien — polia, ktoré idú do `updateTask`. */
export interface TaskEdit {
  title?: string;
  note?: string | null;
  append_note?: string;
  due?: string | null;
  time?: string | null;
  estimate_min?: number | null;
  priority?: number;
  energy?: "low" | "mid" | "high" | null;
  context?: string | null;
  all_day?: boolean;
}

/** Už preložené mená. `undefined` = nemení sa, `null` = odobrať. */
export interface TaskRefs {
  projectId?: string | null;
  areaId?: string | null;
  subjectId?: string | null;
}

/**
 * Záplata pre `updateTask`. Kľúč, ktorý v úprave nie je, v záplate chýba —
 * akcia ho nechá tak; `null` pole vymaže.
 */
export function taskPatch(
  current: { note: string | null; allDay: boolean },
  edit: TaskEdit,
  refs: TaskRefs = {},
): Result<{ patch: UpdateTaskPatch }> {
  if (edit.note !== undefined && edit.append_note !== undefined) {
    return { ok: false, error: "Pošli buď note (celá poznámka), alebo append_note (doplnenie), nie oboje." };
  }
  if (edit.all_day === true && edit.time !== undefined && edit.time !== null) {
    return { ok: false, error: "Celodenná úloha nemá čas — pošli time: null, alebo all_day: false." };
  }

  const patch: UpdateTaskPatch = {};
  if (edit.title !== undefined) patch.title = edit.title.trim();
  if (edit.note !== undefined) patch.note = blank(edit.note);
  if (edit.append_note !== undefined && edit.append_note.trim() !== "") {
    /* Doplnenie ide za celú uloženú poznámku — model vidí len jej začiatok. */
    const before = current.note?.trimEnd() ?? "";
    patch.note = before === "" ? edit.append_note.trim() : `${before}\n\n${edit.append_note.trim()}`;
  }
  if (edit.due !== undefined) patch.dueDate = edit.due;
  if (edit.time !== undefined) {
    patch.plannedTime = edit.time;
    /* Hodina a „celý deň“ sa vylučujú — kto dáva čas, deň už celý nechce. */
    if (edit.time !== null && current.allDay && edit.all_day === undefined) patch.allDay = false;
  }
  if (edit.estimate_min !== undefined) patch.estimateMin = edit.estimate_min;
  if (edit.priority !== undefined) patch.priority = edit.priority;
  if (edit.energy !== undefined) patch.energy = edit.energy;
  if (edit.context !== undefined) patch.context = blank(edit.context)?.trim() ?? null;
  if (edit.all_day !== undefined) patch.allDay = edit.all_day;
  if (refs.projectId !== undefined) patch.projectId = refs.projectId;
  if (refs.areaId !== undefined) patch.areaId = refs.areaId;
  if (refs.subjectId !== undefined) patch.subjectId = refs.subjectId;
  return { ok: true, patch };
}

/**
 * Štítky na pridanie a odobratie. Pridávajú sa menom (`attachTag` založí
 * nový), odoberajú podľa id z úlohy (`detachTag`). Odobrať štítok, ktorý
 * úloha nemá, je chyba — model sa pravdepodobne pomýlil v mene.
 */
export function tagChanges(
  current: readonly { id: string; name: string }[],
  add: readonly string[] = [],
  remove: readonly string[] = [],
): Result<{ add: string[]; removeIds: string[] }> {
  const clean = (name: string) => name.trim().replace(/^#/u, "").trim();
  const has = new Map(current.map((tag) => [key(tag.name), tag]));

  const removeIds: string[] = [];
  const removing = new Set<string>();
  for (const raw of remove) {
    const name = clean(raw);
    if (name === "") continue;
    const tag = has.get(key(name));
    if (tag === undefined) {
      const list = current.map((t) => t.name).join(", ");
      return {
        ok: false,
        error: `Štítok „${name}“ na úlohe nie je. ${list === "" ? "Úloha nemá žiadne štítky." : `Má: ${list}.`}`,
      };
    }
    if (!removing.has(tag.id)) removeIds.push(tag.id);
    removing.add(tag.id);
  }

  const addNames: string[] = [];
  const adding = new Set<string>();
  for (const raw of add) {
    const name = clean(raw);
    if (name === "") continue;
    const k = key(name);
    const existing = has.get(k);
    if (existing !== undefined && removing.has(existing.id)) {
      return { ok: false, error: `Štítok „${name}“ nemôže naraz pribudnúť aj ubudnúť.` };
    }
    if (existing !== undefined || adding.has(k)) continue;
    adding.add(k);
    addNames.push(name);
  }
  return { ok: true, add: addNames, removeIds };
}

/** Ktoré polia výstupu sa zmenili — model tak vidí, čo naozaj prešlo. */
export function changedFields(before: object, after: object): string[] {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
}

/* ═══════════════════════════════════════════════════════════════════════════
   UDALOSŤ A DEADLINE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Typy, ktoré sa k druhu hodia — rovnako ako výber v detaile udalosti. */
const TYPES_FOR: Record<AgendaKind, readonly AgendaType[]> = {
  event: ["exam", "oral", "other"],
  deadline: ["submit", "other"],
};

/**
 * Druh a typ po úprave.
 *
 * Typ sám napovie druh: odovzdanie je deadline, písomka a skúšanie udalosť.
 * Zmena druhu bez typu prepne nehodiaci sa typ na „iné“ — rovnako ako
 * formulár v appke. Rozpor (deadline + písomka) je chyba, nie odhad.
 */
export function kindAndType(
  current: { kind: AgendaKind; type: AgendaType } | null,
  kind?: AgendaKind,
  type?: AgendaType,
): Result<{ kind: AgendaKind; type: AgendaType }> {
  const k: AgendaKind =
    kind ??
    (type === "submit" ? "deadline" : type === "exam" || type === "oral" ? "event" : (current?.kind ?? "event"));
  const t: AgendaType =
    type ?? (current !== null && TYPES_FOR[k].includes(current.type) ? current.type : "other");
  if (!TYPES_FOR[k].includes(t)) {
    return {
      ok: false,
      error:
        k === "deadline"
          ? `Deadline je „submit“ (odovzdanie) alebo „other“ — „${t}“ je udalosť.`
          : `Udalosť je „exam“, „oral“ alebo „other“ — odovzdanie („submit“) je deadline.`,
    };
  }
  return { ok: true, kind: k, type: t };
}

/** To z uloženej udalosti, s čím úprava počíta. Riadok z databázy to spĺňa. */
export interface AgendaState {
  kind: AgendaKind;
  type: AgendaType;
  title: string;
  note: string | null;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  period: number | null;
  place: string | null;
  subjectId: string | null;
  blocksDay: boolean;
  remind: string | null;
  cancelledAt: Date | string | null;
  grade: number | null;
}

/** Vstup `create_event` a `update_event` bez id a predmetu. */
export interface AgendaEdit {
  title?: string;
  kind?: AgendaKind;
  type?: AgendaType;
  date?: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  place?: string | null;
  note?: string | null;
  blocks_day?: boolean;
  cancelled?: boolean;
  grade?: number | null;
  grade_note?: string | null;
}

/** Polia, ktoré idú cez formulár (`updateAgendaItem`) — nie presun, zrušenie ani známka. */
const FORM_FIELDS = [
  "title",
  "kind",
  "type",
  "end_date",
  "start_time",
  "end_time",
  "place",
  "note",
  "blocks_day",
] as const satisfies readonly (keyof AgendaEdit)[];

/** Čas a dni po úprave musia dávať zmysel. Kontroluje sa len to, čo úprava poslala. */
function checkTiming(
  v: { kind: AgendaKind; date: string; endDate: string | null; startTime: string | null; endTime: string | null },
  edit: AgendaEdit,
): string | null {
  if (v.kind === "deadline" && edit.start_time !== undefined && edit.start_time !== null) {
    return "Deadline nemá začiatok — hodina „do“ sa zadáva ako end_time.";
  }
  if (v.kind === "deadline" && edit.end_date !== undefined && edit.end_date !== null && edit.end_date > v.date) {
    return "Deadline je na jeden deň — end_date je len pre viacdňovú udalosť.";
  }
  if (v.endDate !== null && v.endDate < v.date) return "Posledný deň (end_date) je pred prvým.";
  const multi = v.endDate !== null && v.endDate > v.date;
  const timed = edit.start_time !== undefined || edit.end_time !== undefined;
  if (v.kind === "event" && !multi && timed && v.startTime !== null && v.endTime !== null && v.endTime <= v.startTime) {
    return "Koniec je skôr než začiatok.";
  }
  return null;
}

/**
 * Nová udalosť pre `createAgendaItem`.
 *
 * Písomka a skúšanie dostanú pripomienku večer vopred, rovnako ako zo
 * zachytenia. Čas písomky s predmetom doplní rozvrh na serveri.
 */
export function agendaCreateInput(
  edit: AgendaEdit & { title: string; date: string },
  subjectId: string | null,
): Result<{ input: AgendaInput }> {
  const kt = kindAndType(null, edit.kind, edit.type);
  if (!kt.ok) return kt;
  const { kind, type } = kt;
  const startTime = kind === "event" ? (edit.start_time ?? null) : null;
  const endTime = edit.end_time ?? null;
  const endDate = kind === "event" ? (edit.end_date ?? null) : null;
  const problem = checkTiming({ kind, date: edit.date, endDate, startTime, endTime }, edit);
  if (problem !== null) return { ok: false, error: problem };

  return {
    ok: true,
    input: {
      kind,
      type,
      title: edit.title.trim(),
      note: blank(edit.note),
      date: edit.date,
      endDate: endDate !== null && endDate > edit.date ? endDate : null,
      startTime,
      endTime,
      place: blank(edit.place),
      subjectId,
      ...(kind === "event" && edit.blocks_day !== undefined ? { blocksDay: edit.blocks_day } : {}),
      remind: kind === "event" && isAssessment(type) ? "eve" : null,
    },
  };
}

export interface AgendaEditPlan {
  /** Nový deň — ide cez `moveAgendaItem`. `null`, keď sa deň nemení. */
  move: string | null;
  /** Treba poslať formulár (`updateAgendaItem`)? */
  form: boolean;
  /** Zrušiť / obnoviť (`setAgendaCancelled`), keď sa stav mení. */
  cancelled?: boolean;
  /** Známka (`setAgendaGrade`). `note: undefined` nechá poznámku tak. */
  grade?: { grade: number | null; note?: string | null };
}

/**
 * Plán úpravy udalosti — overí CELÚ úpravu skôr, než sa čokoľvek zapíše.
 *
 * Úprava ide v krokoch ako v appke: presun dňa (`moveAgendaItem` posunie aj
 * koniec viacdňovej a písomke nájde hodinu v nový deň), potom formulár,
 * zrušenie a známka. Keby sa chyba ukázala až v treťom kroku, prvý by už
 * bol zapísaný — preto sa všetko overuje tu, vopred.
 */
export function planAgendaEdit(
  current: AgendaState,
  edit: AgendaEdit,
  subjectId?: string | null,
): Result<AgendaEditPlan> {
  const kt = kindAndType(current, edit.kind, edit.type);
  if (!kt.ok) return kt;
  const { kind, type } = kt;

  const date = edit.date ?? current.date;
  const delta = diffDays(current.date, date);
  /* Presun posunie aj koniec viacdňovej — tak, ako to spraví `moveAgendaItem`. */
  const shiftedEnd = current.endDate !== null ? addDays(current.endDate, delta) : null;
  const endDate = edit.end_date !== undefined ? edit.end_date : shiftedEnd;
  const startTime = edit.start_time !== undefined ? edit.start_time : hhmm(current.startTime);
  const endTime = edit.end_time !== undefined ? edit.end_time : hhmm(current.endTime);
  const problem = checkTiming(
    { kind, date, endDate: kind === "event" ? endDate : null, startTime, endTime },
    edit,
  );
  if (problem !== null) return { ok: false, error: problem };

  if ((edit.grade !== undefined || edit.grade_note !== undefined) && !(kind === "event" && isAssessment(type))) {
    return { ok: false, error: "Známka sa zapisuje len k písomke alebo skúšaniu." };
  }

  const move = date !== current.date ? date : null;
  /* Viacdňová sa porovnáva po presune; koniec v prvý deň znamená jednodňovú. */
  const lastDay = (end: string | null) => (end !== null && end > date ? end : null);
  const differs: Record<(typeof FORM_FIELDS)[number], boolean> = {
    title: edit.title !== undefined && edit.title.trim() !== current.title,
    kind: kind !== current.kind,
    type: type !== current.type,
    end_date: edit.end_date !== undefined && lastDay(edit.end_date) !== lastDay(shiftedEnd),
    start_time: edit.start_time !== undefined && edit.start_time !== hhmm(current.startTime),
    end_time: edit.end_time !== undefined && edit.end_time !== hhmm(current.endTime),
    place: edit.place !== undefined && blank(edit.place) !== current.place,
    note: edit.note !== undefined && blank(edit.note) !== current.note,
    blocks_day: edit.blocks_day !== undefined && edit.blocks_day !== current.blocksDay,
  };
  /*
    Po presune sa formulár pošle aj s „rovnakými“ hodnotami: presun písomke
    čas prepočíta z rozvrhu a výslovne zadaný čas ho má prepísať.
  */
  const provided = FORM_FIELDS.some((field) => edit[field] !== undefined);
  const subjectChanged = subjectId !== undefined && subjectId !== current.subjectId;
  const form =
    subjectChanged ||
    FORM_FIELDS.some((field) => differs[field]) ||
    (move !== null && (provided || subjectId !== undefined));

  const plan: AgendaEditPlan = { move, form };
  if (edit.cancelled !== undefined && edit.cancelled !== (current.cancelledAt !== null)) {
    plan.cancelled = edit.cancelled;
  }
  if (edit.grade !== undefined || edit.grade_note !== undefined) {
    plan.grade = {
      grade: edit.grade !== undefined ? edit.grade : current.grade,
      ...(edit.grade_note !== undefined ? { note: blank(edit.grade_note) } : {}),
    };
  }
  return { ok: true, ...plan };
}

/**
 * Treba pred formulárom zistiť hodinu predmetu? Vráti predmet a deň, alebo `null`.
 *
 * `updateAgendaItem` prepočíta poradie hodiny (`period`) len vtedy, keď
 * písomka príde bez času — s časom ju berie ako ručne zadanú a väzbu na
 * hodinu zahodí. Písomka by potom v rozpočte dňa zaberala čas druhýkrát
 * (raz v škole, raz ako udalosť). Keď úprava čas nemení a písomka bola na
 * hodine, pošle sa preto bez času a server hodinu nájde znova — ak ešte je.
 */
export function lessonSlotWanted(
  fresh: AgendaState,
  edit: AgendaEdit,
  subjectId?: string | null,
): { subjectId: string; date: string } | null {
  if (edit.start_time !== undefined || edit.end_time !== undefined) return null;
  const kt = kindAndType(fresh, edit.kind, edit.type);
  if (!kt.ok || kt.kind !== "event" || !isAssessment(kt.type)) return null;
  if (fresh.period === null) return null;
  const subject = subjectId !== undefined ? subjectId : fresh.subjectId;
  if (subject === null) return null;
  const endDate = edit.end_date !== undefined ? edit.end_date : fresh.endDate;
  if (endDate !== null && endDate > fresh.date) return null;
  return { subjectId: subject, date: fresh.date };
}

/**
 * Celý formulár pre `updateAgendaItem` — uložená udalosť (už na správnom
 * dni) a zmeny z úpravy. Oblasť a projekt v ňom nie sú: chýbajúce pole
 * akcia nechá tak.
 *
 * `slot` je hodina predmetu z `lessonSlotFor`, keď ju `lessonSlotWanted`
 * pýtal. Keď hodina v ten deň už nie je, čas ostane, aký bol.
 */
export function agendaForm(
  fresh: AgendaState,
  edit: AgendaEdit,
  subjectId: string | null | undefined,
  slot: { room: string | null } | null,
): AgendaInput {
  const kt = kindAndType(fresh, edit.kind, edit.type);
  const { kind, type } = kt.ok ? kt : fresh;
  const subject = subjectId !== undefined ? subjectId : fresh.subjectId;
  const rawEnd = kind === "event" ? (edit.end_date !== undefined ? edit.end_date : fresh.endDate) : null;

  let startTime = kind === "deadline" ? null : edit.start_time !== undefined ? edit.start_time : hhmm(fresh.startTime);
  let endTime = edit.end_time !== undefined ? edit.end_time : hhmm(fresh.endTime);
  let place = edit.place !== undefined ? blank(edit.place) : fresh.place;
  if (slot !== null && lessonSlotWanted(fresh, edit, subjectId) !== null) {
    startTime = null;
    endTime = null;
    /* Nový predmet, nová učebňa — rovnako ako pri presune na iný deň. */
    if (edit.place === undefined && subject !== fresh.subjectId) place = slot.room ?? fresh.place;
  }

  return {
    kind,
    type,
    title: edit.title !== undefined ? edit.title.trim() : fresh.title,
    note: edit.note !== undefined ? blank(edit.note) : fresh.note,
    date: fresh.date,
    endDate: rawEnd !== null && rawEnd > fresh.date ? rawEnd : null,
    startTime,
    endTime,
    place,
    subjectId: subject,
    blocksDay: kind === "event" ? (edit.blocks_day ?? fresh.blocksDay) : false,
    remind: isAgendaReminder(fresh.remind) ? fresh.remind : null,
  };
}
