import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Leventia installer upload.
//
// Streams a release binary onto the Railway volume at /data/releases. Used by
// scripts/publish-update.mjs in the desktop repo; there is no UI for it.
//
// Auth is the same LEVENTIA_UPDATE_TOKEN bearer that guards publishing. Without
// the token set in the environment this endpoint refuses everything, so it can
// never be left accidentally open.
//
// The body is piped straight to disk while being hashed, so a 168 MB installer
// never sits in memory and the response can report the SHA-256 the manifest needs.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const RELEASES_DIR = process.env.RELEASES_DIR ?? "/data/releases";

export async function POST(request: NextRequest) {
  const token = process.env.LEVENTIA_UPDATE_TOKEN;
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token || !bearer || bearer !== token) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = request.nextUrl.searchParams.get("name") ?? "";
  // Only a bare filename — never a path.
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return Response.json({ error: "Bad or missing ?name=" }, { status: 400 });
  }
  if (!request.body) {
    return Response.json({ error: "Empty body" }, { status: 400 });
  }

  try {
    mkdirSync(RELEASES_DIR, { recursive: true });
  } catch {
    /* already there */
  }

  const full = path.join(RELEASES_DIR, name);
  const hash = createHash("sha256");
  const out = createWriteStream(full);
  const reader = request.body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      if (!out.write(value)) {
        await new Promise<void>((resolve) => out.once("drain", resolve));
      }
    }
    await new Promise<void>((resolve, reject) => {
      out.end(() => resolve());
      out.on("error", reject);
    });
  } catch (e) {
    try {
      out.destroy();
    } catch {
      /* ignore */
    }
    return Response.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }

  const size = statSync(full).size;
  return Response.json({
    ok: true,
    name,
    size,
    sha256: hash.digest("hex"),
    url: `${request.nextUrl.origin}/api/leventia/download/${encodeURIComponent(name)}`,
  });
}
