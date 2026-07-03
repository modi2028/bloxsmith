import "server-only";
import { z } from "zod";

/**
 * All server secrets pass through here exactly once. Anything missing or
 * malformed fails fast at boot instead of surfacing as a runtime 500 later.
 * Never import this file from client components — "server-only" enforces it.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Base URL of this deployment, e.g. http://localhost:3000
  APP_URL: z.string().url(),

  // Supabase Postgres connection string (transaction pooler, port 6543).
  DATABASE_URL: z.string().min(1),

  // Supabase project (Storage for image attachments). The service-role key
  // stays server-side only.
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // 32-byte key, base64-encoded, for AES-256-GCM encryption of provider API
  // keys and TOTP secrets at rest. Generate: openssl rand -base64 32
  MASTER_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message:
        "MASTER_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)",
    }),

  // Secret used to sign session cookies. Generate: openssl rand -base64 32
  SESSION_SECRET: z.string().min(32),

  // Roblox OAuth 2.0 app (register at create.roblox.com/dashboard/credentials)
  ROBLOX_CLIENT_ID: z.string().min(1),
  ROBLOX_CLIENT_SECRET: z.string().min(1),

  // Comma-separated Roblox user IDs that are allowed to hold the admin role.
  // A user not on this list can never elevate, regardless of their DB row.
  ADMIN_ROBLOX_USER_IDS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number),
    ),

  // Optional comma-separated CIDR/IP allowlist for /admin routes.
  ADMIN_IP_ALLOWLIST: z.string().optional(),

  // Stripe. SECRET_KEY enables Checkout/portal; WEBHOOK_SECRET verifies the
  // webhook. Both optional so the app runs without billing configured.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/**
 * Validated on FIRST ACCESS at runtime — not at module import — so that
 * `next build` (which evaluates route modules to collect page data) doesn't
 * require production secrets. Hosts inject secrets at runtime; the build
 * artifact stays portable.
 */
let cached: Env | undefined;
function getEnv(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}

export const env = new Proxy({} as Env, {
  get: (_target, prop: string) => getEnv()[prop as keyof Env],
  has: (_target, prop: string) => prop in getEnv(),
});
