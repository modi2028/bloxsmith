import { config as loadDotenv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Standalone CLI runs (drizzle-kit) don't get Next.js's automatic env
// loading — pull in .env.local (then .env) explicitly.
loadDotenv({ path: [".env.local", ".env"] });

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Only needed for `drizzle-kit push/migrate`; `generate` works offline.
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/placeholder",
  },
  strict: true,
  verbose: true,
});
