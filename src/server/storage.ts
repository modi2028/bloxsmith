import "server-only";
import { randomUUID } from "node:crypto";
import { env } from "@/server/env";

/**
 * Supabase Storage via the REST API (no extra SDK dependency).
 *
 * Generated images come back on short-lived provider URLs, so anything we
 * show later — a refreshed page, an old project — must be a copy we host.
 * Uploads go to a public bucket created on demand.
 */

const BUCKET = "generated-images";

let bucketReady = false;

async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: 10 * 1024 * 1024,
      allowed_mime_types: ["image/png", "image/jpeg", "image/webp"],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  // 409 = already exists, which is the normal case after the first run.
  if (res.ok || res.status === 409) {
    bucketReady = true;
    return;
  }
  throw new Error(`Could not prepare image storage (${res.status})`);
}

/**
 * Copy a remote image into our own storage and return a permanent URL.
 * Throws if the source can't be fetched or the upload fails — callers
 * decide whether to fall back to the temporary URL.
 */
export async function mirrorImage(
  sourceUrl: string,
  userId: string,
): Promise<string> {
  const srcRes = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!srcRes.ok) throw new Error(`Source image fetch failed (${srcRes.status})`);

  const contentType = srcRes.headers.get("content-type") ?? "image/png";
  const bytes = new Uint8Array(await srcRes.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("Source image was empty");

  await ensureBucket();

  const ext = contentType.includes("jpeg")
    ? "jpg"
    : contentType.includes("webp")
      ? "webp"
      : "png";
  const path = `${userId}/${randomUUID()}.${ext}`;

  const upRes = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        "cache-control": "31536000",
      },
      body: bytes,
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!upRes.ok) {
    throw new Error(`Image upload failed (${upRes.status})`);
  }

  return `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}
