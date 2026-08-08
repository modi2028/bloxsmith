import "server-only";

/**
 * Nano Banana — Google's Gemini image model — used here to draw a reference
 * BEFORE the agent builds.
 *
 * To be clear about what this does, because it is easy to expect more: it
 * produces a picture, not geometry. Nothing in it becomes a part. What it buys
 * is that the builder gets to LOOK at a concrete version of the thing before
 * placing anything — silhouette, proportion, colour, what details exist and
 * where — instead of building from a sentence. That is worth a lot when the
 * next step is a 60-part build_model call, and worth nothing at all if it is
 * mistaken for a modelling step.
 *
 * Separate from the /image command (which runs on gpt-image-2 through the
 * ChatGPT proxy and is a user-facing feature). This one is an agent tool, on a
 * different provider and a different key.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * "Nano Banana" proper. Overridable because Google renames these often — and
 * because the Pro variant (gemini-3-pro-image-preview) is a drop-in swap when
 * a build wants the better draughtsman and can pay for it.
 */
const MODEL = process.env.NANO_BANANA_MODEL ?? "gemini-2.5-flash-image";

/** Reference images are working material, not deliverables — keep them cheap. */
const TIMEOUT_MS = 45_000;

export type ReferenceImage = {
  /** Raw base64, no data: prefix. */
  data: string;
  mediaType: string;
};

export function isNanoBananaConfigured(): boolean {
  return !!process.env.GOOGLE_API_KEY;
}

/**
 * Everything the agent asks for is a Roblox build reference, so the style
 * direction is applied here rather than being left to the model to remember.
 * A photoreal render is the wrong reference for a blocky medium — what helps
 * is a clean three-quarter view with the forms readable.
 */
function framePrompt(subject: string): string {
  return (
    `A single ${subject}, centred, three-quarter view, full object in frame, ` +
    "on a plain neutral background. Clean readable forms with clear separate " +
    "panels, edges and details. Even lighting, no dramatic shadows, no text, " +
    "no watermark, no people, no scenery around it. Concept-art reference " +
    "sheet style for a 3D modeller."
  );
}

export async function generateReferenceImage(
  subject: string,
  signal?: AbortSignal,
): Promise<ReferenceImage> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("Reference images are not configured on this server.");

  // The caller's abort must still win; this only bounds a hung upstream.
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const res = await fetch(`${ENDPOINT}/${MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: framePrompt(subject) }] }],
    }),
    signal: combined,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // The body carries Google's actual reason (bad key, quota, blocked
    // prompt); losing it makes every failure look identical.
    throw new Error(`Nano Banana ${res.status}: ${body.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] };
      finishReason?: string;
    }[];
  };

  const candidate = json.candidates?.[0];
  const part = candidate?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    // A safety block comes back as a candidate with no image rather than an
    // HTTP error, so it has to be caught here.
    throw new Error(
      `Nano Banana returned no image${
        candidate?.finishReason ? ` (${candidate.finishReason})` : ""
      }.`,
    );
  }

  return {
    data: part.inlineData.data,
    mediaType: part.inlineData.mimeType ?? "image/png",
  };
}
