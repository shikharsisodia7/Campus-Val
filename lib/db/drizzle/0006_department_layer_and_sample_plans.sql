CREATE TABLE "department_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_email" text NOT NULL,
	"actor_user_id" text,
	"program_key" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"target_key" text,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE "department_requirement_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_key" text NOT NULL,
	"program_type" text NOT NULL,
	"target_key" text,
	"bulletin_edition" text NOT NULL,
	"body" text NOT NULL,
	"note_kind" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"origin" text NOT NULL,
	"source_type" text NOT NULL,
	"source_label" text,
	"source_url" text,
	"source_reference" text,
	"source_anchor_text" text,
	"import_key" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_requirement_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_key" text NOT NULL,
	"bulletin_edition" text NOT NULL,
	"entry_type" text NOT NULL,
	"target_key" text NOT NULL,
	"group_key" text,
	"title" text,
	"description" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"course_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"minimum_courses" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"base_fingerprint" text,
	"base_title" text,
	"base_source_version" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_admin_scopes" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"program_key" text NOT NULL,
	"role" text DEFAULT 'department_admin' NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sample_plan_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sample_plan_id" integer NOT NULL,
	"year" integer NOT NULL,
	"term" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"item_type" text NOT NULL,
	"course_code" text,
	"label" text,
	"source_title" text,
	"note" text,
	"units" numeric
);
--> statement-breakpoint
CREATE TABLE "sample_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"version" text NOT NULL,
	"school" text NOT NULL,
	"program" text NOT NULL,
	"program_key" text,
	"title" text NOT NULL,
	"description" text,
	"plan_length" text NOT NULL,
	"academic_year" text,
	"source_type" text NOT NULL,
	"source_label" text,
	"source_url" text,
	"source_reference" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"import_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sample_plan_items" ADD CONSTRAINT "sample_plan_items_sample_plan_id_sample_plans_id_fk" FOREIGN KEY ("sample_plan_id") REFERENCES "public"."sample_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "department_audit_program_idx" ON "department_audit_log" USING btree ("program_key","at");--> statement-breakpoint
CREATE INDEX "department_notes_program_idx" ON "department_requirement_notes" USING btree ("program_key","bulletin_edition");--> statement-breakpoint
CREATE INDEX "department_notes_target_idx" ON "department_requirement_notes" USING btree ("target_key");--> statement-breakpoint
CREATE UNIQUE INDEX "department_notes_import_key_unique" ON "department_requirement_notes" USING btree ("import_key");--> statement-breakpoint
CREATE UNIQUE INDEX "department_overrides_target_unique" ON "department_requirement_overrides" USING btree ("bulletin_edition","target_key");--> statement-breakpoint
CREATE INDEX "department_overrides_program_idx" ON "department_requirement_overrides" USING btree ("program_key","bulletin_edition");--> statement-breakpoint
CREATE UNIQUE INDEX "program_admin_scopes_email_program_unique" ON "program_admin_scopes" USING btree ("email","program_key");--> statement-breakpoint
CREATE INDEX "program_admin_scopes_email_idx" ON "program_admin_scopes" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sample_plan_items_plan_idx" ON "sample_plan_items" USING btree ("sample_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sample_plans_slug_version_unique" ON "sample_plans" USING btree ("slug","version");--> statement-breakpoint
CREATE INDEX "sample_plans_school_idx" ON "sample_plans" USING btree ("school","status");