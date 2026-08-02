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

  const auth = {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  };

  // Ask before creating. The create endpoint reports an existing bucket as a
  // FAILURE — 400 with a "Duplicate" body, not the 409 you would expect — so
  // creating-and-tolerating-the-error means depending on the exact status and
  // wording of an error response. A plain existence check does not.
  const head = await fetch(
    `${env.SUPABASE_URL}/storage/v1/bucket/${BUCKET}`,
    { headers: auth, signal: AbortSignal.timeout(15_000) },
  ).catch(() => null);
  if (head?.ok) {
    bucketReady = true;
    return;
  }

  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: 10 * 1024 * 1024,
      allowed_mime_types: ["image/png", "image/jpeg", "image/webp"],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) {
    bucketReady = true;
    return;
  }

  // Belt and braces: if two requests raced, the loser sees a duplicate error
  // and the bucket is nonetheless there.
  const body = await res.text().catch(() => "");
  if (res.status === 409 || /duplicate|already exists/i.test(body)) {
    bucketReady = true;
    return;
  }
  // The body is what makes this diagnosable — a bare status said nothing.
  throw new Error(
    `Could not prepare image storage (${res.status}): ${body.slice(0, 200)}`,
  );
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
  return storeImageBytes(bytes, contentType, userId);
}

/**
 * Store image bytes we already hold.
 *
 * Providers differ in what they hand back: z.ai returns a temporary URL,
 * while the ChatGPT proxy returns base64 inline. The URL path has to fetch
 * before it can store; this one is the shared half, and it is what a base64
 * response uses directly.
 */
export async function storeImageBytes(
  // Narrowed to an ArrayBuffer-backed view: a plain `Uint8Array` may be
  // SharedArrayBuffer-backed, which is not a valid request body.
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
  userId: string,
): Promise<string> {
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
      // Wrapped in a Blob so the body type is stable whether the caller hands
      // us a Buffer (base64 decode) or a Uint8Array (fetched bytes).
      body: new Blob([bytes], { type: contentType }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!upRes.ok) {
    throw new Error(`Image upload failed (${upRes.status})`);
  }

  return `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}
