ALTER TABLE "ai_requests" ALTER COLUMN "credits_reserved" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "ai_requests" ALTER COLUMN "credits_charged" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "credit_transactions" ALTER COLUMN "delta" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "model_pricing" ALTER COLUMN "base_cost" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "model_pricing" ALTER COLUMN "max_credits_per_request" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "model_pricing" ALTER COLUMN "max_credits_per_request" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "credits" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "redemption_codes" ALTER COLUMN "credits" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "daily_spend_limit" SET DATA TYPE numeric(14, 4);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "monthly_spend_limit" SET DATA TYPE numeric(14, 4);