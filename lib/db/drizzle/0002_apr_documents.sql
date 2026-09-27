-- Multiple Academic Progress Reports per student (one Workday export per major/minor).
-- Additive and data-preserving: every existing row stays, becomes that student's first
-- APR document, and keeps the safe generic label 'Academic Progress Report' (the major
-- is never guessed). Safe to apply BEFORE the new application code is deployed.
ALTER TABLE "progress_reports" DROP CONSTRAINT IF EXISTS "progress_reports_user_id_unique";--> statement-breakpoint
ALTER TABLE "progress_reports" ADD COLUMN "label" text DEFAULT 'Academic Progress Report' NOT NULL;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD COLUMN "category" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD COLUMN "display_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD COLUMN "source_format" text DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD COLUMN "file_hash" text;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD COLUMN "workbook" jsonb;--> statement-breakpoint
ALTER TABLE "progress_reports" ADD COLUMN "import_error" text;--> statement-breakpoint
CREATE INDEX "progress_reports_user_order_idx" ON "progress_reports" USING btree ("user_id","display_order","id");--> statement-breakpoint
UPDATE "progress_reports" SET "source_format" = 'xlsx'
  WHERE "content_type" = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     OR lower("file_name") LIKE '%.xlsx';
