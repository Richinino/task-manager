CREATE TABLE "learning_pillars" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skill_milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"title" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"reached_at" timestamp with time zone,
	"evidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pillar_id" text NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "lesson_pillar_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "lesson_skill_id" text;--> statement-breakpoint
ALTER TABLE "learning_pillars" ADD CONSTRAINT "learning_pillars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_milestones" ADD CONSTRAINT "skill_milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_milestones" ADD CONSTRAINT "skill_milestones_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_pillar_id_learning_pillars_id_fk" FOREIGN KEY ("pillar_id") REFERENCES "public"."learning_pillars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_pillars_user_idx" ON "learning_pillars" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skill_milestones_user_idx" ON "skill_milestones" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skill_milestones_skill_idx" ON "skill_milestones" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "skills_user_idx" ON "skills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skills_pillar_idx" ON "skills" USING btree ("pillar_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lesson_pillar_id_learning_pillars_id_fk" FOREIGN KEY ("lesson_pillar_id") REFERENCES "public"."learning_pillars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lesson_skill_id_skills_id_fk" FOREIGN KEY ("lesson_skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;