ALTER TYPE "public"."credit_tx_kind" ADD VALUE 'daily_reward';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "roblox_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reward_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reward_last_claim_day" text;