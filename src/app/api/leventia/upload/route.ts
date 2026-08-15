import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, statSync } from "node:fs";
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
// The body is piped straight to disk, so a large installer never sits in memory.
//
// CHUNKED: Cloudflare fronts this domain and rejects request bodies over 100 MB
// with a 413 before they ever reach the app, so a 168 MB installer cannot be sent
// in one request. Callers therefore POST sequential chunks:
//   ?name=X            → create/truncate, write this chunk
//   ?name=X&append=1   → append this chunk
//   GET ?name=X        → size + SHA-256 of the assembled file, to verify the join
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
  const append = request.nextUrl.searchParams.get("append") === "1";
  const out = createWriteStream(full, { flags: append ? "a" : "w" });
  const reader = request.body.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
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

  // Size only — the whole-file hash comes from GET once every chunk has landed.
  return Response.json({ ok: true, name, appended: append, size: statSync(full).size });
}

/** Size + SHA-256 of an assembled upload, so the caller can verify the join. */
export async function GET(request: NextRequest) {
  const token = process.env.LEVENTIA_UPDATE_TOKEN;
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token || !bearer || bearer !== token) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = request.nextUrl.searchParams.get("name") ?? "";
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return Response.json({ error: "Bad or missing ?name=" }, { status: 400 });
  }

  const full = path.join(RELEASES_DIR, name);
  let size: number;
  try {
    size = statSync(full).size;
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    createReadStream(full)
      .on("data", (c) => hash.update(c))
      .on("end", () => resolve())
      .on("error", reject);
  });

  // APP_URL, not nextUrl.origin — inside the container the request origin is
  // localhost:8080, which is useless to a client.
  const base = (process.env.APP_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  return Response.json({
    ok: true,
    name,
    size,
    sha256: hash.digest("hex"),
    url: `${base}/api/leventia/download/${encodeURIComponent(name)}`,
  });
}
