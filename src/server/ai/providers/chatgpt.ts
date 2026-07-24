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
 * Upstream model actually asked for. Deliberately env-driven and decoupled
 * from our catalog id ("chatgpt"): which models a ChatGPT account may reach
 * depends on its plan and changes over time, so switching is a config change,
 * not a migration. `npm run chatgpt:models` lists what this account offers.
 */
const UPSTREAM_MODEL = process.env.CHATGPT_OAUTH_MODEL ?? "gpt-5.5";

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
      { ...params, modelId: UPSTREAM_MODEL },
      {
        baseURL: BASE_URL,
        maxTokensParam: "max_completion_tokens",
        supportsImages: true,
        maxOutputTokens: 32_000,
      },
    );
  } catch (err) {
    if (isUnreachable(err)) {
      throw new Error(
        "ChatGPT is offline right now — pick another model and your build will run straight away.",
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
