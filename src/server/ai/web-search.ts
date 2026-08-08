import "server-only";
import { checkBuildArtifact } from "@/lib/content-policy";
import { redactInjection } from "@/lib/untrusted-text";
import { getProviderApiKey } from "./keys";

/**
 * Live web search as one of OUR tools, so any model can call it.
 *
 * Why a tool and not a provider feature: z.ai's native `web_search` runs
 * inside their inference and feeds results straight into the model's context,
 * which means (a) only z.ai models get it and (b) nothing is observable, so
 * the UI can never show that a search happened. Titan (Codex OAuth) has no
 * search at all — the endpoint accepts a web_search tool and silently ignores
 * it, then the model says it cannot search. Verified against the live proxy.
 *
 * Running it ourselves fixes both: every model can search, and each call is a
 * real tool_call the chat can render.
 *
 * Backed by z.ai's standalone search endpoint, which the existing z.ai key
 * already covers — no second vendor, no extra key.
 */

const SEARCH_URL =
  process.env.ZAI_SEARCH_URL || "https://api.z.ai/api/paas/v4/web_search";

export type WebSearchHit = { title: string; url: string; snippet: string };


/** Shape varies by engine/version, so every field is read defensively. */
type RawHit = {
  title?: string;
  link?: string;
  url?: string;
  content?: string;
  snippet?: string;
};

export async function searchWeb(params: {
  query: string;
  limit?: number;
}): Promise<WebSearchHit[]> {
  const apiKey = await getProviderApiKey("zai");
  const limit = Math.min(Math.max(params.limit ?? 5, 1), 10);

  // 429 is the normal failure here, not an exceptional one: the whole site
  // shares one z.ai key, so several builds searching at once trip the rate
  // limit routinely. It is also entirely transient — waiting a second fixes
  // it — so it is retried rather than reported as "web search failed", which
  // is what the user was seeing mid-build.
  const attempt = async (): Promise<Response> =>
    fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      // Measured against search_pro / search_pro_bing / search_pro_jina on the
      // same query: search_std returned the most results AND the most English
      // ones (9 of 10, vs 4 of 10 for search_pro). Do not "upgrade" to a pro
      // engine without re-measuring.
      search_engine: "search_std",
      search_query: params.query,
      count: limit,
      // NOTE: content_size is deliberately NOT sent. Passing it collapsed a
      // 10-result response down to 1 in testing.
    }),
    signal: AbortSignal.timeout(25_000),
  });

  let res = await attempt();
  // Three tries, backing off. Retrying a 5xx too: those are the provider
  // having a moment, and the cost of one extra request is nothing next to
  // losing the search a build was about to use.
  for (let i = 0; i < 2 && (res.status === 429 || res.status >= 500); i++) {
    await new Promise((r) => setTimeout(r, 900 * (i + 1)));
    res = await attempt();
  }

  if (!res.ok) {
    // The message reaches the model, so it has to say what to DO. Without
    // this it retried the same search and lost the round again.
    if (res.status === 429) {
      throw new Error(
        "web search is rate-limited right now (429) — do not search again this turn; build from what you already know",
      );
    }
    throw new Error(
      `web search failed (${res.status}) — build from what you already know rather than searching again`,
    );
  }

  const body = (await res.json()) as { search_result?: RawHit[] };
  const hits = (body.search_result ?? [])
    .map((r) => ({
      title: redactInjection((r.title ?? "").trim()),
      url: (r.link ?? r.url ?? "").trim(),
      snippet: redactInjection(
        (r.content ?? r.snippet ?? "").replace(/\s+/g, " ").trim(),
      ).slice(0, 600),
    }))
    .filter((r) => r.snippet || r.title)
    // The same screen the build artifacts get. Search reaches every model now,
    // including the free tier, so a query with an innocent wording can still
    // pull back graphic or attack-related text — and whatever comes back
    // steers the build. Blocked results are dropped entirely rather than
    // redacted: there is no version of that content we want in the context.
    .filter((r) => !checkBuildArtifact(`${r.title} ${r.snippet}`).blocked);

  // The index is Chinese-leaning, so an English query can still surface CJK
  // pages. Nothing is discarded — they are just ranked below the English ones,
  // so the useful results survive the `limit` cut.
  const cjk = /[぀-ヿ㐀-鿿가-힯]/;
  return hits
    .map((h, i) => ({ h, i, cjk: cjk.test(h.title) }))
    .sort((a, b) => Number(a.cjk) - Number(b.cjk) || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.h);
}
