import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  date,
  time,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ═══════════════════════════════════════════════════════════════════════════
   ENUMY
   ═══════════════════════════════════════════════════════════════════════════ */

/** inbox → todo → doing → waiting → done | dropped */
export const taskStatus = pgEnum("task_status", [
  "inbox",
  "todo",
  "doing",
  "waiting",
  "done",
  "dropped",
]);

/** Na ktorý horizont úloha patrí. */
export const horizon = pgEnum("horizon", ["day", "week", "month", "someday"]);

/** Koľko energie si úloha vyžaduje. */
export const energy = pgEnum("energy", ["low", "mid", "high"]);

export const projectStatus = pgEnum("project_status", [
  "active",
  "on_hold",
  "done",
  "dropped",
]);

/** raw → incubating → promoted | rejected | faded */
export const ideaStage = pgEnum("idea_stage", [
  "raw",
  "incubating",
  "promoted",
  "rejected",
  "faded",
]);

export const reviewType = pgEnum("review_type", [
  "daily_plan",
  "daily_shutdown",
  "weekly",
  "monthly",
]);

/** Audit log úloh — poháňa štatistiky, archív aj počítadlo odkladov. */
export const taskEventType = pgEnum("task_event_type", [
  "created",
  "status_changed",
  "postponed",
  "rescheduled",
  "completed",
  "reopened",
  "edited",
  "deleted",
]);

/** Na čo odkaz ukazuje — pre [[obojsmerné odkazy]] a tagy. */
export const entityType = pgEnum("entity_type", [
  "task",
  "idea",
  "project",
  "area",
  "journal",
]);

/* ═══════════════════════════════════════════════════════════════════════════
   POUŽÍVATEĽ
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Systém je jednopoužívateľský, ale `userId` nesie každá tabuľka —
 * je to lacná poistka a robí dotazy explicitnými.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  /** Nastavenia: WIP limit, hodiny dňa, prahy odkladov… viď src/lib/settings.ts */
  settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * OAuth tokeny (Google Calendar, M8). Zatiaľ sa nezapisuje —
 * prihlásenie beží na JWT session bez adaptéra.
 */
export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scope: text("scope"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

/* ═══════════════════════════════════════════════════════════════════════════
   OBLASTI A PROJEKTY
   ═══════════════════════════════════════════════════════════════════════════ */

/** Dlhodobé okruhy života. Nemajú koniec, len sa udržiavajú. */
export const areas = pgTable(
  "areas",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"),
    icon: text("icon"),
    sort: integer("sort").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("areas_user_idx").on(t.userId)],
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    areaId: text("area_id").references(() => areas.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    goal: text("goal"),
    /** Kedy je projekt hotový — bez tohto sa projekty nikdy nezavrú. */
    definitionOfDone: text("definition_of_done"),
    status: projectStatus("status").notNull().default("active"),
    deadline: date("deadline"),
    sort: integer("sort").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("projects_user_idx").on(t.userId),
    index("projects_status_idx").on(t.userId, t.status),
  ],
);

/* ═══════════════════════════════════════════════════════════════════════════
   ÚLOHY
   ═══════════════════════════════════════════════════════════════════════════ */

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    note: text("note"),

    status: taskStatus("status").notNull().default("inbox"),
    /** 1 = najvyššia, 3 = najnižšia. Zámerne len tri stupne. */
    priority: integer("priority").notNull().default(3),

    /** Dokedy MUSÍ byť hotová. */
    dueDate: date("due_date"),
    dueTime: time("due_time"),
    /** Ktorý deň to IDEM ROBIŤ. Toto je to, čo plní obrazovku „Dnes". */
    plannedDate: date("planned_date"),
    plannedTime: time("planned_time"),

    horizon: horizon("horizon").notNull().default("week"),
    /** Odhad v minútach: 5 / 15 / 30 / 60 / 120 / 240 */
    estimateMin: integer("estimate_min"),
    energy: energy("energy"),
    /** @pocitac, @telefon, @mesto, @doma */
    context: text("context"),

    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    areaId: text("area_id").references(() => areas.id, { onDelete: "set null" }),
    /** Podúlohy — self reference. */
    parentTaskId: text("parent_task_id"),

    /**
     * Jedna najdôležitejšia vec dňa. Max jedna na deň.
     *
     * V rozhraní sa tomu hovorí „priorita dňa"; názvy `is_frog`/`isFrog`
     * ostávajú z pôvodného „eat the frog", aby sa kvôli popisku nerobila
     * migrácia.
     */
    isFrog: boolean("is_frog").notNull().default(false),

    /** RRULE pre opakovanie (M7). */
    recurrenceRule: text("recurrence_rule"),
    recurrenceParentId: text("recurrence_parent_id"),

    /**
     * Lekcia — úloha, ktorá je zároveň učením.
     *
     * Pilier je povinný na to, aby úloha bola lekciou; zručnosť nie.
     * Učenie sa totiž nezačína pomenovanou zručnosťou, ale tým, že si
     * o niečom hodinu čítal. Zručnosť sa dá priradiť aj spätne.
     *
     * `set null` pri zmazaní: keď pilier zanikne, úloha ostáva úlohou —
     * len prestane byť lekciou. Zmazať pilier nesmie zmazať prácu.
     */
    lessonPillarId: text("lesson_pillar_id").references(() => learningPillars.id, {
      onDelete: "set null",
    }),
    lessonSkillId: text("lesson_skill_id").references(() => skills.id, {
      onDelete: "set null",
    }),

    /**
     * Úloha zaberie celý deň.
     *
     * Sťahovanie, výlet, celodenná návšteva. Nemá hodinu a v rozpočte
     * nezaberá svoj odhad, ale celé okno dňa — takže sa na ten deň už nič
     * iné neplánuje. Presne to je jej zmysel: nie „trvá dlho", ale
     * „tento deň je zabraný".
     *
     * Odhad si napriek tomu môže niesť. Nepoužije sa na rozpočet, ale ostáva
     * ako údaj o tom, koľko z toho dňa je naozaj práca.
     */
    allDay: boolean("all_day").notNull().default(false),

    /**
     * Úloha patrí svojmu dňu a nikam sa nepresúva.
     *
     * Tréning je buď v utorok, alebo nebol. Keď sa nespravil, nemá zmysel,
     * aby sa ďalší týždeň vliekol v „po termíne" — tam patria veci, ktoré
     * sa ešte dajú dobehnúť. Takto označená úloha ostáva vo svojom dni
     * (nájdeš ju, keď sa naň pozrieš), ale prepadnutá nikdy nie je.
     *
     * Nemaže sa a nezahadzuje: záznam, že sa vec nestala, je informácia.
     */
    staysOnDay: boolean("stays_on_day").notNull().default(false),

    /** Koľkokrát bola úloha odložená. Pohon anti-prokrastinácie. */
    postponeCount: integer("postpone_count").notNull().default(0),

    sort: integer("sort").notNull().default(0),

    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_user_idx").on(t.userId),
    index("tasks_planned_idx").on(t.userId, t.plannedDate),
    index("tasks_due_idx").on(t.userId, t.dueDate),
    index("tasks_status_idx").on(t.userId, t.status),
    index("tasks_project_idx").on(t.projectId),
    index("tasks_parent_idx").on(t.parentTaskId),
  ],
);

/** Audit log. Nič sa nemaže — odtiaľto sa počítajú štatistiky aj archív. */
export const taskEvents = pgTable(
  "task_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    type: taskEventType("type").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    /**
     * Voľný text od používateľa. Zatiaľ jediný pisateľ je blok pri odkladoch:
     * dôvod, prečo sa úloha odkladá znova.
     *
     * Vlastný stĺpec preto, že `fromValue`/`toValue` držia hodnoty, ktoré sa
     * menili (tu dátumy). Veta napchatá do `toValue` by znamenala, že revízie
     * v M6 aj štatistiky v M7 musia hádať, čo v stĺpci vlastne je.
     */
    note: text("note"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("task_events_task_idx").on(t.taskId),
    index("task_events_user_at_idx").on(t.userId, t.at),
  ],
);

/* ═══════════════════════════════════════════════════════════════════════════
   NÁPADY
   ═══════════════════════════════════════════════════════════════════════════ */

export const ideas = pgTable(
  "ideas",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    areaId: text("area_id").references(() => areas.id, { onDelete: "set null" }),

    title: text("title").notNull(),
    body: text("body"),
    stage: ideaStage("stage").notNull().default("raw"),
    /** 1–5, ako veľmi ma to ťahá. Váži výber v inkubátore. */
    spark: integer("spark").notNull().default(3),
    /** Najmenší možný ďalší krok. */
    nextStep: text("next_step"),

    /** Pohon inkubátora (30 dní) aj automatického zhnitia (6 mesiacov). */
    lastTouchedAt: timestamp("last_touched_at", { withTimezone: true }).notNull().defaultNow(),
    promotedProjectId: text("promoted_project_id").references(() => projects.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("ideas_user_idx").on(t.userId),
    index("ideas_stage_idx").on(t.userId, t.stage),
    index("ideas_touched_idx").on(t.userId, t.lastTouchedAt),
  ],
);

/* ═══════════════════════════════════════════════════════════════════════════
   TAGY A ODKAZY
   ═══════════════════════════════════════════════════════════════════════════ */

export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tags_user_name_idx").on(t.userId, t.name)],
);

export const taggables = pgTable(
  "taggables",
  {
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    entityType: entityType("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tagId, t.entityType, t.entityId] }),
    index("taggables_entity_idx").on(t.entityType, t.entityId),
  ],
);

/** Obojsmerné odkazy [[názov]] medzi ľubovoľnými entitami. */
export const links = pgTable(
  "links",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromType: entityType("from_type").notNull(),
    fromId: text("from_id").notNull(),
    toType: entityType("to_type").notNull(),
    toId: text("to_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("links_unique_idx").on(t.fromType, t.fromId, t.toType, t.toId),
    index("links_to_idx").on(t.toType, t.toId),
  ],
);

/* ═══════════════════════════════════════════════════════════════════════════
   NÁVYKY, DENNÍK, REVÍZIE
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
   UČENIE

   Tri vrstvy nad sebou a jedno rozhodnutie, ktoré celok drží pohromade.

   **Pilier** je doména — Ruky, Hudba, Technika, Telo. Zámerne NIE oblasť:
   oblasť odpovedá na „do ktorej časti života to patrí", takže by sa všetko
   učenie zlialo do jednej. Pilier odpovedá na „v čom rastiem" a až vďaka
   tomu má rozdelenie zmysel.

   **Zručnosť** je konkrétna vec v pilieri — lockpicking, píšťalka, SQL.
   Keby boli piliere a zručnosti to isté, dostali by sme zoznam zručností
   napísaný dvakrát a analýza by nepovedala nič.

   **Lekcia NEMÁ vlastnú tabuľku.** Je to dokončená úloha, ktorá má pilier.
   To nie je šetrenie miestom, ale zásadné rozhodnutie: lekcia sa nemôže
   rozísť s úlohou, z ktorej vznikla. Od-dokončenie, presun aj zmazanie
   fungujú samy od seba a niet čo synchronizovať — teda ani čo pokaziť.
   Zároveň to znamená, že učenie zaberá rozpočet dňa ako každá iná úloha,
   čo je presne zámer: učenie fyzicky zaberá čas.
   ═══════════════════════════════════════════════════════════════════════════ */

export const learningPillars = pgTable(
  "learning_pillars",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"),
    sort: integer("sort").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("learning_pillars_user_idx").on(t.userId)],
);

export const skills = pgTable(
  "skills",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /*
      Zručnosť bez piliera nedáva zmysel — pilier je jej doména. Pri zmazaní
      piliera sa preto zmažú aj jeho zručnosti; nemali by kam patriť.
    */
    pillarId: text("pillar_id")
      .notNull()
      .references(() => learningPillars.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Jedna veta o tom, prečo sa to učíš. Prežije aj to, keď sa míľniky zmenia. */
    note: text("note"),
    sort: integer("sort").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("skills_user_idx").on(t.userId),
    index("skills_pillar_idx").on(t.pillarId),
  ],
);

export const skillMilestones = pgTable(
  "skill_milestones",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    /**
     * Overiteľná veta, nie číslo úrovne.
     *
     * „Otvoriť zámok s dvomi bezpečnostnými pinmi", nie „level 3". Je to tá
     * istá myšlienka ako „definícia hotovo" pri projekte: musí sa to dať
     * overiť, nie len cítiť.
     */
    title: text("title").notNull(),
    sort: integer("sort").notNull().default(0),
    /** `null`, kým míľnik nie je dosiahnutý. */
    reachedAt: timestamp("reached_at", { withTimezone: true }),
    /**
     * Jedna veta „ako to vieš". Pýta sa až pri odškrtnutí.
     *
     * O rok je z toho čitateľná história namiesto radu odškrtnutých políčok.
     */
    evidence: text("evidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("skill_milestones_user_idx").on(t.userId),
    index("skill_milestones_skill_idx").on(t.skillId),
  ],
);

export const habits = pgTable(
  "habits",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    areaId: text("area_id").references(() => areas.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    /** Cieľ „X× do týždňa" — jedno vynechanie nezhodí sériu. */
    targetPerWeek: integer("target_per_week").notNull().default(7),
    color: text("color").notNull().default("emerald"),
    sort: integer("sort").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("habits_user_idx").on(t.userId)],
);

export const habitEntries = pgTable(
  "habit_entries",
  {
    habitId: text("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    done: boolean("done").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.habitId, t.date] })],
);

export const journal = pgTable(
  "journal",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    body: text("body"),
    /** 1–5 */
    mood: integer("mood"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("journal_user_date_idx").on(t.userId, t.date)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: reviewType("type").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** Odpovede zo sprievodcu — tvar sa líši podľa typu revízie. */
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reviews_user_type_period_idx").on(t.userId, t.type, t.periodStart)],
);

/** Šablóny opakujúcich sa postupov (M9). */
export const templates = pgTable(
  "templates",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Pole definícií úloh, ktoré sa pri použití vytvoria. */
    payload: jsonb("payload").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("templates_user_idx").on(t.userId)],
);

/* ═══════════════════════════════════════════════════════════════════════════
   PRIPOMIENKY

   Dve tabuľky, ktoré spolu tvoria Web Push: KAM sa posiela a ČO sa posiela.

   Sú tu skôr, než ich niekto začne používať. Pridanie tabuľky je bezpečné
   (nič existujúce sa nemení), takže migrácia môže dobehnúť samostatne —
   a kým nie sú nastavené kľúče VAPID, appka sa ich ani nespýta.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Kam posielať — jeden riadok na jeden prehliadač, nie na jedného človeka.
 *
 * Kľúčom je `endpoint`, lebo presne ten prehliadač vydá a presne on
 * identifikuje cieľ. Ten istý človek má bežne tri: telefón, notebook, prácu.
 *
 * `p256dh` a `auth` sú šifrovacie kľúče prehliadača. Bez nich sa správa
 * nedá zašifrovať a push službe je odovzdaná len ako prázdne „zobuď sa".
 * Ukladajú sa v podobe, v akej ich vydá `PushSubscription.toJSON()`.
 *
 * **Prihlásenie sa zruší aj bez nás.** Keď človek odinštaluje appku alebo
 * zmaže dáta stránky, endpoint prestane platiť a push služba odpovie 404
 * alebo 410. Vtedy riadok patrí von — inak by sa doň tlačilo donekonečna.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** Aby sa v nastaveniach dalo rozoznať, ktoré zariadenie je ktoré. */
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Posledné úspešné doručenie — podľa toho sa poznajú mŕtve zariadenia. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/**
 * Čo poslať a kedy.
 *
 * `sentAt` je jediná ochrana pred dvojitým odoslaním: plánovač beží
 * opakovane a bez nej by tú istú pripomienku poslal pri každom behu.
 *
 * `at` je okamih, nie deň — pripomienka bez hodiny nemá zmysel. Ukladá sa
 * s pásmom, takže presun do iného časového pásma nič neposunie.
 *
 * **Prečo vlastná tabuľka a nie výpočet z úlohy:** úloha sa dá presunúť aj
 * po odoslaní pripomienky. Keby sa čas počítal z nej, appka by nemala kde
 * zapísať, že už raz zazvonila, a po presune by zazvonila znova.
 */
export const reminders = pgTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reminders_user_idx").on(t.userId),
    /* Dopyt plánovača znie „neodoslané, ktoré už dozreli" — presne v tomto
       poradí, takže index musí začínať `sentAt`. */
    index("reminders_due_idx").on(t.sentAt, t.at),
    /* Jedna pripomienka na úlohu a okamih. Dvojklik na „pripomeň mi" tak
       nevytvorí dve. */
    uniqueIndex("reminders_task_at_idx").on(t.taskId, t.at),
  ],
);

/* ═══════════════════════════════════════════════════════════════════════════
   RELÁCIE
   ═══════════════════════════════════════════════════════════════════════════ */

export const areasRelations = relations(areas, ({ many }) => ({
  projects: many(projects),
  tasks: many(tasks),
  ideas: many(ideas),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  area: one(areas, { fields: [projects.areaId], references: [areas.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  area: one(areas, { fields: [tasks.areaId], references: [areas.id] }),
  /* Úloha s pilierom JE lekcia — samostatná tabuľka lekcií neexistuje. */
  lessonPillar: one(learningPillars, {
    fields: [tasks.lessonPillarId],
    references: [learningPillars.id],
  }),
  lessonSkill: one(skills, {
    fields: [tasks.lessonSkillId],
    references: [skills.id],
  }),
  parent: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "subtasks",
  }),
  subtasks: many(tasks, { relationName: "subtasks" }),
  events: many(taskEvents),
}));

export const taskEventsRelations = relations(taskEvents, ({ one }) => ({
  task: one(tasks, { fields: [taskEvents.taskId], references: [tasks.id] }),
}));

export const ideasRelations = relations(ideas, ({ one }) => ({
  area: one(areas, { fields: [ideas.areaId], references: [areas.id] }),
  promotedProject: one(projects, {
    fields: [ideas.promotedProjectId],
    references: [projects.id],
  }),
}));

export const learningPillarsRelations = relations(learningPillars, ({ many }) => ({
  skills: many(skills),
  /* Lekcie nie sú vlastná tabuľka — sú to dokončené úlohy s pilierom. */
  lessons: many(tasks),
}));

export const skillsRelations = relations(skills, ({ one, many }) => ({
  pillar: one(learningPillars, {
    fields: [skills.pillarId],
    references: [learningPillars.id],
  }),
  milestones: many(skillMilestones),
  lessons: many(tasks),
}));

export const skillMilestonesRelations = relations(skillMilestones, ({ one }) => ({
  skill: one(skills, { fields: [skillMilestones.skillId], references: [skills.id] }),
}));

export const habitsRelations = relations(habits, ({ one, many }) => ({
  area: one(areas, { fields: [habits.areaId], references: [areas.id] }),
  entries: many(habitEntries),
}));

export const habitEntriesRelations = relations(habitEntries, ({ one }) => ({
  habit: one(habits, { fields: [habitEntries.habitId], references: [habits.id] }),
}));

/* ═══════════════════════════════════════════════════════════════════════════
   TYPY
   ═══════════════════════════════════════════════════════════════════════════ */

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Area = typeof areas.$inferSelect;
export type NewArea = typeof areas.$inferInsert;
export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
export type Habit = typeof habits.$inferSelect;
export type LearningPillar = typeof learningPillars.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type SkillMilestone = typeof skillMilestones.$inferSelect;
export type JournalEntry = typeof journal.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type TaskEvent = typeof taskEvents.$inferSelect;
export type User = typeof users.$inferSelect;

export type TaskStatus = Task["status"];
export type Horizon = Task["horizon"];
export type Energy = NonNullable<Task["energy"]>;
export type IdeaStage = Idea["stage"];
