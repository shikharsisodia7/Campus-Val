CREATE TABLE "progress_report_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"raw_code" text NOT NULL,
	"course_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "progress_report_mappings_user_raw_unique" ON "progress_report_mappings" USING btree ("user_id","raw_code");