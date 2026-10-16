CREATE TABLE "department_canonical_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_key" text NOT NULL,
	"program_type" text NOT NULL,
	"school" text NOT NULL,
	"document_title" text NOT NULL,
	"source_file_name" text NOT NULL,
	"source_url" text NOT NULL,
	"academic_year" text,
	"document_version" text,
	"provenance_status" text DEFAULT 'documented' NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"publication_status" text DEFAULT 'draft' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "department_requirement_notes" ADD COLUMN "canonical_resource_id" integer;--> statement-breakpoint
ALTER TABLE "department_requirement_notes" ADD COLUMN "source_academic_year" text;--> statement-breakpoint
ALTER TABLE "department_requirement_notes" ADD COLUMN "source_document_version" text;--> statement-breakpoint
ALTER TABLE "department_requirement_notes" ADD COLUMN "provenance_status" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
-- Existing staff-authored rows have a known, non-document provenance. Imported
-- legacy rows deliberately remain `legacy` until a canonical resource is
-- registered and reviewed; do not guess a document for them.
UPDATE "department_requirement_notes" SET "provenance_status" = 'department_admin' WHERE "source_type" = 'admin_entry';--> statement-breakpoint
CREATE INDEX "department_canonical_resources_program_idx" ON "department_canonical_resources" USING btree ("program_key","publication_status");--> statement-breakpoint
CREATE UNIQUE INDEX "department_canonical_resources_program_file_version_unique" ON "department_canonical_resources" USING btree ("program_key","source_file_name","document_version");--> statement-breakpoint
ALTER TABLE "department_requirement_notes" ADD CONSTRAINT "department_requirement_notes_canonical_resource_id_department_canonical_resources_id_fk" FOREIGN KEY ("canonical_resource_id") REFERENCES "public"."department_canonical_resources"("id") ON DELETE restrict ON UPDATE no action;
