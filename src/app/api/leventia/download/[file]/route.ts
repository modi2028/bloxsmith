import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import type { ReadableOptions } from "node:stream";

// ─────────────────────────────────────────────────────────────────────────────
// Leventia installer download.
//
// Serves release binaries from the Railway volume mounted at /data (see
// RELEASES_DIR). Public on purpose — the desktop updater fetches this URL with no
// credentials, and the app itself is licence-key gated, so the installer being
// downloadable doesn't grant anyone access.
//
// Supports HTTP Range so a 168 MB download can resume instead of restarting from
// zero on a dropped connection — which matters a lot for the auto-updater.
//
// Uploads are NOT handled here: the binary is pushed straight onto the volume with
// `railway volume files upload`, so there's no upload endpoint to secure.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RELEASES_DIR = process.env.RELEASES_DIR ?? "/data/releases";

/** Node Readable → Web ReadableStream, so we never buffer the file in memory. */
function toWebStream(nodeStream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) =>
        controller.enqueue(new Uint8Array(chunk as Buffer)),
      );
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      (nodeStream as unknown as { destroy?: () => void }).destroy?.();
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;

  // Path traversal guard: only a bare filename may be requested, never a path.
  const name = decodeURIComponent(file);
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    return new Response("Bad request", { status: 400 });
  }

  const full = path.join(RELEASES_DIR, name);

  let size: number;
  try {
    const st = statSync(full);
    if (!st.isFile()) throw new Error("not a file");
    size = st.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${name}"`,
    "Accept-Ranges": "bytes",
    // Installers are immutable once published — let any CDN/proxy cache hard.
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  // ── Ranged request (resume) ────────────────────────────────────────────────
  const range = request.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = m[1] ? Number(m[1]) : 0;
      let end = m[2] ? Number(m[2]) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        return new Response("Range Not Satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      end = Math.min(end, size - 1);
      start = Math.max(start, 0);
      const opts: ReadableOptions & { start: number; end: number } = { start, end };
      return new Response(toWebStream(createReadStream(full, opts)), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
  }

  return new Response(toWebStream(createReadStream(full)), {
    status: 200,
    headers: { ...headers, "Content-Length": String(size) },
  });
}
