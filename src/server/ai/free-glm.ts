import "server-only";
import { getProviderApiKey } from "./keys";

/**
 * Simple non-streaming chat against Z.ai's FREE GLM tier — used for the
 * zero-cost helpers: Better Prompter and Blox Chat. Thinking disabled for
 * snappy replies.
 *
 * Model choice (tested live): glm-4.5-flash answers in ~1.3s at $0;
 * glm-4.7-flash (also listed free) hung and 500'd, so it's not the default —
 * switch via ZAI_FREE_MODEL when it stabilizes.
 */
const FREE_GLM_BASE =
  process.env.ZAI_PAAS_BASE || "https://api.z.ai/api/paas/v4";
const FREE_GLM_MODEL = process.env.ZAI_FREE_MODEL || "glm-4.5-flash";

export async function freeGlmChat(params: {
  system: string;
  messages: { role: "user" | "assistant"; text: string }[];
  maxTokens?: number;
}): Promise<string> {
  const apiKey = await getProviderApiKey("zai");
  const res = await fetch(`${FREE_GLM_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: FREE_GLM_MODEL,
      messages: [
        { role: "system", content: params.system },
        ...params.messages.map((m) => ({ role: m.role, content: m.text })),
      ],
      max_tokens: params.maxTokens ?? 1200,
      temperature: 0.7,
      thinking: { type: "disabled" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!res.ok || !text) {
    throw new Error(
      data.error?.message ?? `Free GLM request failed (${res.status})`,
    );
  }
  return text;
}
