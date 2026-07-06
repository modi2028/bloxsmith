ALTER TYPE "public"."user_role" ADD VALUE 'super_admin';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_models" jsonb DEFAULT '[]'::jsonb NOT NULL;