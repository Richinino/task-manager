CREATE TABLE "agenda_reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agenda_item_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda_reminders" ADD CONSTRAINT "agenda_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_reminders" ADD CONSTRAINT "agenda_reminders_agenda_item_id_agenda_items_id_fk" FOREIGN KEY ("agenda_item_id") REFERENCES "public"."agenda_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_reminders_user_idx" ON "agenda_reminders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_reminders_item_at_idx" ON "agenda_reminders" USING btree ("agenda_item_id","at");--> statement-breakpoint
/*
  Písomky a skúšania, ktoré ešte len prídu, dostanú pripomienku „večer
  vopred" — rovnako ako každá nová písomka zo zachytenia. Vznikli skôr, než
  pripomienky existovali, takže voľbu nikdy nemali. Zrušené, zmazané
  a prebehnuté sa nechajú tak; vypnúť sa dá v detaile udalosti.
*/
UPDATE agenda_items
SET remind = 'eve', updated_at = now()
WHERE kind = 'event'
  AND type IN ('exam', 'oral')
  AND remind IS NULL
  AND cancelled_at IS NULL
  AND deleted_at IS NULL
  AND date >= current_date;
