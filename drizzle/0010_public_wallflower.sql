ALTER TYPE "public"."user_plan" ADD VALUE 'max';--> statement-breakpoint
ALTER TABLE "model_pricing" ADD COLUMN "min_plan" "user_plan" DEFAULT 'free' NOT NULL;