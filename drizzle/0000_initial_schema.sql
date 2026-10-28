CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"current_role" text NOT NULL,
	"target_role" text NOT NULL,
	"years" text NOT NULL,
	"stack" text NOT NULL,
	"focus" text NOT NULL,
	"notes" text DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" uuid,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"source" text NOT NULL,
	"score" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid,
	"input" jsonb NOT NULL,
	"trace" jsonb NOT NULL,
	"chunks" jsonb NOT NULL,
	"plan" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
