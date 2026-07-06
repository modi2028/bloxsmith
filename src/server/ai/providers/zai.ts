import "server-only";
import type { ProviderAdapter } from "../provider";
import { streamOpenAICompatibleResponse } from "./openai";

/**
 * Z.ai (Zhipu) GLM adapter. Z.ai's OpenAI-compatible endpoint implements the
 * full Chat Completions contract — tools, streaming, usage — so we route
 * through the shared OpenAI streamer with their base URL.
 * API keys come from https://z.ai (set with: npm run key:set -- zai <key>).
 */
const ZAI_BASE_URL = "https://api.z.ai/api/openai/v1";

export const streamZaiResponse: ProviderAdapter = (params) =>
  streamOpenAICompatibleResponse(params, {
    baseURL: ZAI_BASE_URL,
    maxTokensParam: "max_tokens",
  });
