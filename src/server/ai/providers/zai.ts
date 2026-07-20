import "server-only";
import type { ProviderAdapter } from "../provider";
import { streamOpenAICompatibleResponse } from "./openai";

/**
 * Z.ai (Zhipu) GLM adapter. Z.ai's OpenAI-compatible endpoints implement the
 * full Chat Completions contract — tools, streaming, usage — so we route
 * through the shared OpenAI streamer with their base URL.
 *
 * Verified against the live API: GLM Coding Plan keys work on
 * /api/coding/paas/v4 (the default here); pay-per-token API balance uses
 * /api/paas/v4 instead — override with the ZAI_BASE_URL env var if needed.
 * (An /api/openai/v1 path floating around in blog posts 404s.)
 * API keys come from https://z.ai (set with: npm run key:set -- zai <key>).
 */
const ZAI_BASE_URL =
  process.env.ZAI_BASE_URL || "https://api.z.ai/api/coding/paas/v4";

export const streamZaiResponse: ProviderAdapter = (params) =>
  streamOpenAICompatibleResponse(params, {
    baseURL: ZAI_BASE_URL,
    maxTokensParam: "max_tokens",
    // GLM text models can't see images (vision is the separate GLM-V line);
    // attachments become a text note instead of a hard provider error.
    supportsImages: false,
    // Thinking follows the user's "Thinking" spend toggle (default ON).
    // History note: disabling it once leaked deliberation into visible chat
    // ("hmm… nevermind"); the Execution-discipline prompt now guards that,
    // and the loop force-enables thinking on Max effort regardless.
    // Lower temperature keeps GLM decisive.
    extraBody: {
      temperature: 0.7,
      thinking: {
        type: params.thinkingEnabled === false ? "disabled" : "enabled",
      },
    },
    // Titan's native web search — z.ai runs it server-side and feeds results
    // straight into the model's context (verified accepted on glm-5.2).
    rawExtraTools: params.webSearch
      ? [{ type: "web_search", web_search: { enable: true } }]
      : [],
  });
