CREATE TABLE "requirement_customizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"target_key" text NOT NULL,
	"group_key" text,
	"title" text,
	"note" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"course_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"base_fingerprint" text,
	"base_title" text,
	"base_source_version" text,
	"base_source_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requirement_customizations" ADD CONSTRAINT "requirement_customizations_plan_id_academic_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."academic_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_customizations_target_unique" ON "requirement_customizations" USING btree ("plan_id","entry_type","target_key");--> statement-breakpoint
CREATE INDEX "requirement_customizations_plan_idx" ON "requirement_customizations" USING btree ("plan_id");