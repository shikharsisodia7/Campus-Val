CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text,
	"name" text NOT NULL,
	"student_id" text,
	"student_type" text NOT NULL,
	"college" text NOT NULL,
	"major" text NOT NULL,
	"second_major" text,
	"minor" text,
	"additional_majors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"additional_minors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_term" text NOT NULL,
	"start_year" integer NOT NULL,
	"expected_grad_term" text NOT NULL,
	"expected_grad_year" integer NOT NULL,
	"units_completed_at_scu" numeric(6, 2) DEFAULT '0' NOT NULL,
	"units_transferred_in" numeric(6, 2) DEFAULT '0' NOT NULL,
	"cumulative_gpa" numeric(4, 3),
	"major_gpa" numeric(4, 3),
	"completed_course_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority_registration" boolean DEFAULT false NOT NULL,
	"current_term" text NOT NULL,
	"current_year" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_code" text NOT NULL,
	"section_number" text NOT NULL,
	"term" text NOT NULL,
	"year" integer NOT NULL,
	"instructor" text NOT NULL,
	"meeting_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_time" text DEFAULT '' NOT NULL,
	"end_time" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"seats_total" integer DEFAULT 0 NOT NULL,
	"seats_open" integer DEFAULT 0 NOT NULL,
	"waitlist" integer DEFAULT 0 NOT NULL,
	"synced_by_profile_id" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_line" text
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text,
	"category" text DEFAULT 'general' NOT NULL,
	"message" text NOT NULL,
	"rating" integer,
	"page" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"type" text,
	"subject" text,
	"feature" text,
	"pathname" text,
	"academic_item" text,
	"official_source_url" text,
	"proposed_correction" text,
	"updated_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academic_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"plan_type" text NOT NULL,
	"source_plan_id" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"programs" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"item_type" text NOT NULL,
	"course_code" text,
	"course_title" text,
	"units" numeric,
	"requirement_id" text,
	"requirement_category" text,
	"requirement_label" text,
	"academic_year" integer NOT NULL,
	"term" text NOT NULL,
	"bucket" text DEFAULT 'planned' NOT NULL,
	"completion_source" text,
	"provenance" text,
	"position" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quarter_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"term" text NOT NULL,
	"year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"kind" text NOT NULL,
	"course_code" text,
	"course_title" text,
	"section_number" text,
	"units" numeric,
	"instructor" text,
	"name" text,
	"category" text,
	"institution" text,
	"external_course_label" text,
	"notes" text,
	"meeting_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirement_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"college_code" text NOT NULL,
	"group_id" text NOT NULL,
	"requirement_id" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"object_path" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parsed" jsonb,
	"parse_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_reports_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"user_type" text NOT NULL,
	"feature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_user_id" text NOT NULL,
	"advisor_email" text NOT NULL,
	"scopes" jsonb DEFAULT '["degree_plan"]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_user_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_profiles_user_unique" ON "student_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_sections_unique" ON "course_sections" USING btree ("course_code","section_number","term","year");--> statement-breakpoint
CREATE INDEX "academic_plans_user_idx" ON "academic_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_items_plan_idx" ON "plan_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "quarter_schedules_user_idx" ON "quarter_schedules" USING btree ("user_id","term","year");--> statement-breakpoint
CREATE INDEX "schedule_events_schedule_idx" ON "schedule_events" USING btree ("schedule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_events_section_unique_idx" ON "schedule_events" USING btree ("schedule_id","course_code","section_number") WHERE kind = 'section';--> statement-breakpoint
CREATE UNIQUE INDEX "req_completion_unique" ON "requirement_completions" USING btree ("user_id","college_code","group_id","requirement_id");--> statement-breakpoint
CREATE INDEX "usage_events_user_idx" ON "usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_events_feature_idx" ON "usage_events" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "usage_events_created_idx" ON "usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "plan_shares_student_idx" ON "plan_shares" USING btree ("student_user_id");--> statement-breakpoint
CREATE INDEX "plan_shares_advisor_email_idx" ON "plan_shares" USING btree ("advisor_email");