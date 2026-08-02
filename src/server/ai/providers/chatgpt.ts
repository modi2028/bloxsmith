import "server-only";
import type { ModelResponse, ProviderAdapter } from "../provider";
import { streamOpenAICompatibleResponse } from "./openai";

/**
 * ChatGPT over a Codex OAuth session (openai-oauth), NOT the paid OpenAI API.
 *
 * A local `openai-oauth` proxy holds the ChatGPT sign-in and re-exposes it as
 * an OpenAI-compatible endpoint, so the ordinary chat-completions streamer
 * works unchanged — only the base URL differs. Start it alongside the app:
 *
 *   npx openai-oauth@latest login
 *   npx openai-oauth@latest --detach
 *
 * Operational reality, deliberately written down:
 *   - OpenAI has not restricted Codex OAuth in third-party clients (unlike
 *     Anthropic and Google, who both did in Feb 2026), so the mechanism is
 *     fine. Pooling ONE account across every user of a hosted site is the
 *     part openai-oauth's own README rules out, and OpenAI has revoked
 *     third-party OAuth apps before. The account can be cut off without
 *     warning: treat it as expendable and never make it the default model.
 *   - The whole site shares ONE ChatGPT subscription, so upstream rate limits
 *     are global, not per user. `chatgptFairUse` in token-usage.ts is what
 *     keeps a single user from consuming it all.
 *   - The proxy is a separate process. If it is down every request fails, so
 *     the error below has to read as an outage, not as a broken build.
 */

/** OpenAI-compatible endpoint published by the local openai-oauth proxy. */
const BASE_URL = process.env.CHATGPT_OAUTH_BASE ?? "http://127.0.0.1:10531/v1";

/**
 * Our catalog id -> the model actually asked for upstream.
 *
 * Deliberately decoupled: which models a ChatGPT account may reach depends on
 * its plan and changes over time, so switching one is config, not a migration.
 * `npm run chatgpt:models` lists what the connected account offers.
 *
 * More than one rung rides this provider now — Titan on the strongest model
 * available, Luna on a cheaper one for the free tier — so the mapping is
 * per-model rather than a single global.
 */
const UPSTREAM_MODELS: Record<string, string> = {
  chatgpt: process.env.CHATGPT_OAUTH_MODEL ?? "gpt-5.6-sol",
  "chatgpt-5.5": process.env.CHATGPT_OAUTH_MODEL_FREE ?? "gpt-5.5",
};

/** Fall back to Titan's model so an unmapped id fails loudly upstream, not here. */
function upstreamFor(modelId: string): string {
  return UPSTREAM_MODELS[modelId] ?? UPSTREAM_MODELS.chatgpt!;
}

/** The proxy isn't running / isn't reachable. */
function isUnreachable(err: unknown): boolean {
  const s = String((err as Error)?.message ?? err);
  return /ECONNREFUSED|fetch failed|socket hang up|ENOTFOUND|Connection error/i.test(
    s,
  );
}

export const streamChatGptResponse: ProviderAdapter = async (
  params,
): Promise<ModelResponse> => {
  try {
    return await streamOpenAICompatibleResponse(
      { ...params, modelId: upstreamFor(params.modelId) },
      {
        baseURL: BASE_URL,
        maxTokensParam: "max_completion_tokens",
        supportsImages: true,
        maxOutputTokens: 32_000,
      },
    );
  } catch (err) {
    if (isUnreachable(err)) {
      // MUST stay retryable. The loop retries on a fixed set of tokens
      // ("fetch failed" among them), and the proxy is briefly unreachable
      // every time its service redeploys — a window the loop can ride out if
      // it is allowed to try again, and cannot if this throws a friendly
      // sentence matching none of those tokens. The wording here is for logs
      // only; the user-facing text comes from the loop.
      throw new Error(
        `ChatGPT proxy unreachable (fetch failed): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    // 401/403 here means the OAuth session expired or was revoked upstream;
    // it is an operator problem, not something the user can fix.
    if (/401|403|unauthorized|invalid_token/i.test(String(err))) {
      throw new Error(
        "ChatGPT needs to be reconnected — pick another model for now.",
      );
    }
    throw err;
  }
};
