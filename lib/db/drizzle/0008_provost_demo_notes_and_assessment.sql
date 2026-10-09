CREATE TABLE "degree_completion_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"apr_document_id" integer NOT NULL,
	"item_key" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"source_label" text NOT NULL,
	"status_override" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "department_requirement_notes" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "department_requirement_notes" ADD COLUMN "course_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "degree_completion_overrides" ADD CONSTRAINT "degree_completion_overrides_apr_document_id_progress_reports_id_fk" FOREIGN KEY ("apr_document_id") REFERENCES "public"."progress_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "degree_completion_overrides_doc_item_unique" ON "degree_completion_overrides" USING btree ("apr_document_id","item_key");--> statement-breakpoint
CREATE INDEX "degree_completion_overrides_user_idx" ON "degree_completion_overrides" USING btree ("user_id");