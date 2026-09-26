CREATE TYPE "public"."agenda_kind" AS ENUM('event', 'deadline');--> statement-breakpoint
CREATE TYPE "public"."agenda_type" AS ENUM('exam', 'oral', 'submit', 'other');--> statement-breakpoint
CREATE TABLE "agenda_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "agenda_kind" DEFAULT 'event' NOT NULL,
	"type" "agenda_type" DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"date" date NOT NULL,
	"end_date" date,
	"start_time" time,
	"end_time" time,
	"period" integer,
	"place" text,
	"subject_id" text,
	"area_id" text,
	"project_id" text,
	"blocks_day" boolean DEFAULT false NOT NULL,
	"remind" text,
	"grade" integer,
	"grade_note" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "agenda_item_id" text;--> statement-breakpoint
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_subject_id_school_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."school_subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_items_user_date_idx" ON "agenda_items" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "agenda_items_subject_idx" ON "agenda_items" USING btree ("subject_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agenda_item_id_agenda_items_id_fk" FOREIGN KEY ("agenda_item_id") REFERENCES "public"."agenda_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_agenda_idx" ON "tasks" USING btree ("agenda_item_id");--> statement-breakpoint
/*
  Presun písomiek z úloh do udalostí (docs/UDALOSTI.md).

  Každá nezmazaná úloha s druhom `exam` sa stane udalosťou. Dátum je termín,
  inak naplánovaný deň, inak deň vzniku. Keď v ten deň beží hodina predmetu,
  udalosť si vezme jej poradie aj čas — rovnako, ako to spraví nové
  zachytenie. Zahodená písomka je zrušená udalosť.

  Pôvodná úloha sa mäkko zmaže a do jej histórie pribudne dôvod — nič sa
  nemaže natvrdo.
*/
WITH presun AS (
  SELECT
    t.id AS task_id,
    t.user_id,
    t.title,
    t.note,
    t.subject_id,
    t.area_id,
    t.project_id,
    t.status,
    coalesce(t.due_time, t.planned_time) AS cas,
    coalesce(t.due_date, t.planned_date, (t.created_at AT TIME ZONE 'UTC')::date) AS den
  FROM tasks t
  WHERE t.school_kind = 'exam' AND t.deleted_at IS NULL
), vlozene AS (
  INSERT INTO agenda_items (
    id, user_id, kind, type, title, note, date, start_time, end_time, period,
    subject_id, area_id, project_id, cancelled_at
  )
  SELECT
    gen_random_uuid()::text,
    p.user_id,
    'event',
    'exam',
    CASE
      WHEN p.title ~* '^(písomk|pisomk|test|previerk)' THEN p.title
      WHEN btrim(p.title) = '' THEN 'Písomka'
      ELSE 'Písomka — ' || p.title
    END,
    p.note,
    p.den,
    coalesce(h.start_time, p.cas),
    h.end_time,
    h.period,
    p.subject_id,
    p.area_id,
    p.project_id,
    CASE WHEN p.status = 'dropped' THEN now() END
  FROM presun p
  LEFT JOIN LATERAL (
    SELECT l.period, l.start_time, l.end_time
    FROM school_lessons l
    WHERE l.user_id = p.user_id AND l.date = p.den AND l.subject_id = p.subject_id
    ORDER BY l.period
    LIMIT 1
  ) h ON true
  RETURNING id
)
INSERT INTO task_events (id, user_id, task_id, type, note)
SELECT gen_random_uuid()::text, p.user_id, p.task_id, 'deleted', 'presunuté do udalostí'
FROM presun p;--> statement-breakpoint
UPDATE tasks SET deleted_at = now(), updated_at = now()
WHERE school_kind = 'exam' AND deleted_at IS NULL;
