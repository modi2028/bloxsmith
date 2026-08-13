import "server-only";
import { generateReferenceImage } from "./nano-banana";
import { parseObj } from "./obj-parse";
import { sampleTextureAtUvs, type Rgb } from "./texture-sample";
export { parseObj } from "./obj-parse";

/**
 * Meshy — text or image to a real 3D mesh.
 *
 * The pipeline is two calls, and the reason it is only two is that Meshy's
 * image-to-3d accepts a base64 data URI for `image_url`. Nano Banana already
 * returns base64, so its output feeds Meshy directly with nothing hosting the
 * picture in between:
 *
 *   prompt -> Nano Banana (base64 PNG) -> Meshy image-to-3d -> OBJ
 *
 * image-to-3d is preferred over text-to-3d because it is single-stage.
 * text-to-3d needs a preview task and then a refine task carrying the
 * preview's id, which is twice the round trips and twice the waiting for a
 * comparable result.
 *
 * OBJ, not GLB, on purpose: a Roblox plugin cannot load a mesh from an
 * external URL, so the geometry has to be rebuilt in Lua as an EditableMesh.
 * OBJ is plain text and parses in a few lines; GLB is a binary container.
 */

const BASE = "https://api.meshy.ai/openapi";

/** Meshy's own default is 30k. UGC wants far less, and the caller can raise it. */
export const DEFAULT_POLYCOUNT = 8_000;
export const MIN_POLYCOUNT = 100;
/**
 * Well below Meshy's own 300,000, for two independent reasons that happen to
 * agree.
 *
 * Transport: the geometry crosses the wire as JSON through the plugin queue,
 * and now carries a colour per vertex as well. That is ~0.4MB at the 8k
 * default, 2.2MB here, and 13MB at Meshy's ceiling — which the poll endpoint
 * would not carry.
 *
 * Domain: Roblox UGC accessories are budgeted in the low thousands of
 * triangles. A 300k mesh is not a detailed accessory, it is one that cannot
 * be published.
 */
export const MAX_POLYCOUNT = 50_000;

/** A generation takes minutes, not seconds. */
const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 6 * 60_000;

export type MeshyProgress = {
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  /** 0-100. Drives the "watch it build" animation in Studio. */
  progress: number;
};

export type MeshyResult = {
  /** Raw OBJ text, ready to parse into an EditableMesh. */
  obj: string;
  /** Geometry, already parsed — the caller has no reason to do it twice. */
  vertices: [number, number, number][];
  triangles: [number, number, number][];
  /**
   * One colour per vertex, aligned with `vertices`, sampled from the base
   * colour map. Empty when the model came back untextured, which the plugin
   * treats as "leave the mesh its default colour".
   */
  colors: Rgb[];
  taskId: string;
  thumbnailUrl?: string;
  /** What Meshy billed us. Recorded so the spend ceiling has a real number. */
  consumedCredits?: number;
};

export function isMeshyConfigured(): boolean {
  return !!process.env.MESHY_API_KEY;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
    "Content-Type": "application/json",
  };
}

/** 402 and 429 are our problem to handle, not the user's to read raw. */
async function submit(path: string, body: unknown): Promise<string> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (res.status === 402) {
    throw new Error(
      "Meshy is out of credits — the site owner needs to top up the account.",
    );
  }
  if (res.status === 429) {
    throw new Error(
      "Meshy is rate-limited right now. Try again in a minute, or build it from parts instead.",
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Meshy ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as { result?: string; id?: string };
  const id = json.result ?? json.id;
  if (!id) throw new Error("Meshy accepted the job but returned no task id.");
  return id;
}

/**
 * Poll until the task lands. `onProgress` fires on every tick so the caller
 * can stream it — a six-minute wait with no feedback reads as a hang.
 */
async function waitForTask(
  path: string,
  taskId: string,
  onProgress?: (p: MeshyProgress) => void,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Cancelled");

    const res = await fetch(`${BASE}${path}/${taskId}`, { headers: headers() });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Meshy poll ${res.status}: ${detail.slice(0, 200)}`);
    }
    const task = (await res.json()) as Record<string, unknown>;
    const status = String(task.status);
    onProgress?.({
      status: status as MeshyProgress["status"],
      progress: Number(task.progress ?? 0),
    });

    if (status === "SUCCEEDED") return task;
    if (status === "FAILED" || status === "CANCELED") {
      const err = (task.task_error as { message?: string } | undefined)?.message;
      throw new Error(`Meshy could not build that${err ? `: ${err}` : "."}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error("Meshy took too long — try a simpler description.");
}

/** Fetch the OBJ Meshy produced. Its CDN link is short-lived, so this is
 *  done immediately rather than handed to the plugin to fetch later. */
async function downloadObj(task: Record<string, unknown>): Promise<string> {
  const urls = task.model_urls as { obj?: string } | undefined;
  if (!urls?.obj) {
    throw new Error("Meshy returned no OBJ — nothing to rebuild in Studio.");
  }
  const res = await fetch(urls.obj);
  if (!res.ok) throw new Error(`Could not download the mesh (${res.status}).`);
  return res.text();
}

/**
 * The base colour map, if the task produced one.
 *
 * Best effort throughout: a mesh with the wrong colours is a bad model, but a
 * mesh that never arrives because its texture 404'd is a failed build. Every
 * failure here falls back to an untextured mesh.
 */
async function downloadBaseColor(
  task: Record<string, unknown>,
): Promise<Uint8Array | null> {
  const textures = task.texture_urls as
    | { base_color?: string }[]
    | undefined;
  const url = textures?.[0]?.base_color;
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Everything after the task succeeds: fetch, parse, and colour.
 *
 * Both generation paths end here so they cannot drift — text-to-3d silently
 * losing colours because only the image path was updated is exactly the kind
 * of bug that hides for weeks.
 */
async function collectResult(
  task: Record<string, unknown>,
  taskId: string,
): Promise<MeshyResult> {
  const obj = await downloadObj(task);
  const { vertices, triangles, uvs } = parseObj(obj);

  let colors: Rgb[] = [];
  const texture = await downloadBaseColor(task);
  if (texture && uvs.some((uv) => uv != null)) {
    try {
      colors = await sampleTextureAtUvs(texture, uvs);
    } catch {
      // A decode failure is not worth losing the mesh over.
      colors = [];
    }
  }

  return {
    obj,
    vertices,
    triangles,
    colors,
    taskId,
    thumbnailUrl: task.thumbnail_url as string | undefined,
    consumedCredits: task.consumed_credits as number | undefined,
  };
}

/**
 * Make a mesh.
 *
 * With `referenceImage` (the default) the subject is drawn first and the
 * drawing is what gets modelled, which is both faster and more controllable
 * than text-to-3d — you can see what it is about to build.
 */
export async function generateMesh(params: {
  subject: string;
  polycount?: number;
  /** false skips Nano Banana and uses Meshy's own text-to-3d. */
  referenceImage?: boolean;
  onProgress?: (p: MeshyProgress) => void;
  signal?: AbortSignal;
}): Promise<MeshyResult> {
  if (!isMeshyConfigured()) {
    throw new Error("Mesh generation is not configured on this server.");
  }

  const polycount = Math.min(
    MAX_POLYCOUNT,
    Math.max(MIN_POLYCOUNT, Math.round(params.polycount ?? DEFAULT_POLYCOUNT)),
  );

  const common = {
    ai_model: "latest",
    // lowpoly + triangle is what Roblox wants: quads would have to be
    // triangulated on our side anyway, and UGC lives or dies on poly budget.
    model_type: "lowpoly",
    topology: "triangle",
    should_remesh: true,
    target_polycount: polycount,
    target_formats: ["obj"],
  };

  if (params.referenceImage !== false) {
    const image = await generateReferenceImage(params.subject, params.signal);
    const taskId = await submit("/v1/image-to-3d", {
      ...common,
      should_texture: true,
      // The base64 data URI is the whole reason this is two calls and not
      // three — no upload, no hosting, no public URL needed.
      image_url: `data:${image.mediaType};base64,${image.data}`,
    });
    const task = await waitForTask(
      "/v1/image-to-3d",
      taskId,
      params.onProgress,
      params.signal,
    );
    return collectResult(task, taskId);
  }

  // Text path: preview builds the geometry, refine paints it. Two tasks, and
  // the second one needs the first one's id.
  const previewId = await submit("/v2/text-to-3d", {
    ...common,
    mode: "preview",
    prompt: params.subject.slice(0, 600),
  });
  await waitForTask("/v2/text-to-3d", previewId, params.onProgress, params.signal);

  const refineId = await submit("/v2/text-to-3d", {
    mode: "refine",
    preview_task_id: previewId,
    target_formats: ["obj"],
  });
  const task = await waitForTask(
    "/v2/text-to-3d",
    refineId,
    params.onProgress,
    params.signal,
  );

  return collectResult(task, refineId);
}
