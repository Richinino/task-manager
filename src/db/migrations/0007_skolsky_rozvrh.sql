CREATE TYPE "public"."school_item_kind" AS ENUM('homework', 'exam');--> statement-breakpoint
CREATE TABLE "school_breaks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"period" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"subject_id" text NOT NULL,
	"teacher_id" text,
	"room" text,
	"group_name" text,
	"note" text,
	"cancelled" boolean DEFAULT false NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	"source_uid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_subjects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"color" text DEFAULT 'slate' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_teachers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "school_kind" "school_item_kind";--> statement-breakpoint
ALTER TABLE "school_breaks" ADD CONSTRAINT "school_breaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_lessons" ADD CONSTRAINT "school_lessons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_lessons" ADD CONSTRAINT "school_lessons_subject_id_school_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."school_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_lessons" ADD CONSTRAINT "school_lessons_teacher_id_school_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."school_teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_subjects" ADD CONSTRAINT "school_subjects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_teachers" ADD CONSTRAINT "school_teachers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "school_breaks_user_idx" ON "school_breaks" USING btree ("user_id","from_date");--> statement-breakpoint
CREATE INDEX "school_lessons_user_date_idx" ON "school_lessons" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "school_lessons_subject_idx" ON "school_lessons" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_lessons_slot_idx" ON "school_lessons" USING btree ("user_id","date","period","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_subjects_user_code_idx" ON "school_subjects" USING btree ("user_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "school_teachers_user_code_idx" ON "school_teachers" USING btree ("user_id","code");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_subject_id_school_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."school_subjects"("id") ON DELETE set null ON UPDATE no action;