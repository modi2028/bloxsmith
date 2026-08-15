import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAdminForApi, auditAdmin } from "@/server/auth/admin";
import { db, schema } from "@/server/db";
import { clientIp } from "@/server/security/ratelimit";

// ─────────────────────────────────────────────────────────────────────────────
// Leventia auto-update manifest.
//
// The Leventia desktop app checks GET /api/leventia/update on launch. If the
// published version is newer than the running build, it downloads the installer
// from `url`, verifies it against `sha256`, and installs before opening.
//
// The manifest lives in app_settings (key `leventia_update`) — no migration, same
// key/value table the rest of the admin surface uses. Binaries are hosted on
// Supabase Storage; this endpoint fetches the uploaded file and computes its hash
// server-side so the manifest's sha256 always matches what's actually served (the
// publisher can't fat-finger it).
//
// Publishing is authenticated EITHER by a Bloxsmith admin session (publish from
// the site) OR a bearer token in LEVENTIA_UPDATE_TOKEN (publish from a script/CI).
// ─────────────────────────────────────────────────────────────────────────────

const SETTING_KEY = "leventia_update";

interface Manifest {
  version: string;
  url: string;
  sha256: string;
  notes: string;
  mandatory: boolean;
  publishedAt: string;
}

const publishSchema = z.object({
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, "version must be x.y.z"),
  url: z.string().trim().url(),
  notes: z.string().trim().max(2000).optional().default(""),
  mandatory: z.boolean().optional().default(false),
  // Optional: skip the server-side hash (e.g. supplying a known-good hash). When
  // omitted the endpoint downloads `url` and computes it.
  sha256: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
});

/** GET — the public manifest the desktop app polls. Returns {} when nothing is published. */
export async function GET() {
  const row = await db.query.appSettings.findFirst({
    where: eq(schema.appSettings.key, SETTING_KEY),
  });
  const value = (row?.value ?? null) as Manifest | null;
  return Response.json(value && value.version ? value : {}, {
    headers: { "Cache-Control": "public, max-age=30" },
  });
}

/** Stream-download a URL and return its lowercase hex SHA-256, without buffering it all. */
async function sha256OfUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`could not fetch binary (HTTP ${res.status})`);
  const hash = createHash("sha256");
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return hash.digest("hex");
}

/** POST — publish a new manifest. Admin session or bearer token. */
export async function POST(request: NextRequest) {
  const admin = await getAdminForApi();
  const token = process.env.LEVENTIA_UPDATE_TOKEN;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const viaToken = !!token && !!bearer && bearer === token;
  if (!admin && !viaToken) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof publishSchema>;
  try {
    body = publishSchema.parse(await request.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message : "Invalid request";
    return Response.json({ error: msg ?? "Invalid request" }, { status: 400 });
  }

  // Hash the actual hosted file unless a hash was supplied.
  let sha256 = body.sha256?.toLowerCase() ?? "";
  if (!sha256) {
    try {
      sha256 = await sha256OfUrl(body.url);
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Could not hash the binary." },
        { status: 502 },
      );
    }
  }

  const manifest: Manifest = {
    version: body.version,
    url: body.url,
    sha256,
    notes: body.notes,
    mandatory: body.mandatory,
    publishedAt: new Date().toISOString(),
  };

  await db
    .insert(schema.appSettings)
    .values({ key: SETTING_KEY, value: manifest })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: manifest, updatedAt: new Date() },
    });

  if (admin) {
    await auditAdmin({
      actorUserId: admin.id,
      action: "leventia.update.publish",
      targetType: "site",
      targetId: SETTING_KEY,
      after: { version: manifest.version, sha256 },
      ip: clientIp(request),
    });
  }

  return Response.json({ ok: true, ...manifest });
}
