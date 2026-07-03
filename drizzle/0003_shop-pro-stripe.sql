CREATE TYPE "public"."user_plan" AS ENUM('free', 'pro');--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "payment_link_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "redemption_codes" ALTER COLUMN "credits" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "model_pricing" ADD COLUMN "pro_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stripe_price_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "lookup_key" text;--> statement-breakpoint
ALTER TABLE "redemption_codes" ADD COLUMN "grants_pro" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "redemption_codes" ADD COLUMN "pro_days" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" "user_plan" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pro_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_lookup_key_unique" UNIQUE("lookup_key");