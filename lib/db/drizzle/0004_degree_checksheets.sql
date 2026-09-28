-- Degree Checksheets: department documents a student uploads, and the student's own
-- tracking on them. Two NEW tables; no existing table or row is touched, so this is safe
-- to apply BEFORE the new application code is deployed.
--   degree_checksheet_documents    the uploaded source and its display copy (never edited
--                                  by tracking)
--   degree_checksheet_annotations  the student's status / quarter / notes, removed with
--                                  their document (ON DELETE CASCADE)
CREATE TABLE "degree_checksheet_annotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"anchor_type" text NOT NULL,
	"anchor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"anchor_key" text,
	"anchor_fingerprint" text,
	"source_version" integer DEFAULT 1 NOT NULL,
	"detached_at" timestamp with time zone,
	"item_label" text,
	"status" text,
	"term" text,
	"term_year" integer,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "degree_checksheet_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"program_name" text,
	"program_role" text,
	"school" text,
	"academic_year_label" text,
	"source_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"original_filename" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"source_format" text NOT NULL,
	"file_hash" text NOT NULL,
	"object_path" text NOT NULL,
	"source_version" integer DEFAULT 1 NOT NULL,
	"render_status" text DEFAULT 'ready' NOT NULL,
	"render_note" text,
	"render" jsonb,
	"tracking_cell_count" integer DEFAULT 0 NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "degree_checksheet_annotations" ADD CONSTRAINT "degree_checksheet_annotations_document_id_degree_checksheet_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."degree_checksheet_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "degree_checksheet_annotations_document_idx" ON "degree_checksheet_annotations" USING btree ("document_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "degree_checksheet_annotations_user_idx" ON "degree_checksheet_annotations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "degree_checksheet_annotations_anchor_key_idx" ON "degree_checksheet_annotations" USING btree ("document_id","anchor_key");--> statement-breakpoint
CREATE INDEX "degree_checksheet_documents_user_order_idx" ON "degree_checksheet_documents" USING btree ("user_id","sort_order","id");