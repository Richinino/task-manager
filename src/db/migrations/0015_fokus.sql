ALTER TYPE "public"."task_event_type" ADD VALUE 'started';--> statement-breakpoint
CREATE TABLE "focus_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"planned_end_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "focus_sessions_user_task_idx" ON "focus_sessions" USING btree ("user_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "focus_sessions_one_active_idx" ON "focus_sessions" USING btree ("user_id") WHERE "focus_sessions"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "focus_sessions_due_idx" ON "focus_sessions" USING btree ("planned_end_at") WHERE "focus_sessions"."ended_at" is null and "focus_sessions"."notified_at" is null;