/**
 * Single source of truth for model pricing/plans, credit packs, and the Pro
 * plan. Plain module (no server-only) so both the seed/apply scripts and the
 * app can import it.
 *
 * METERING — what users spend:
 *   TOKENS are the user-facing meter. A plan grants a token allowance per
 *   rolling 5-hour window (TOKEN_LIMITS_5H) plus a weekly cap; each effort
 *   tier caps how many tokens ONE build session may consume (EFFORT_TIERS).
 *   Both are the same unit, so they are directly comparable.
 *
 *   The credit rates below no longer gate anything — they exist so every
 *   request records an approximate provider COST (ai_requests.creditsCharged)
 *   for admin analytics. Rates are provider $/1k tokens x 3.
 */

export type PlanTier = "free" | "pro" | "max";

export type CatalogModel = {
  modelId: string;
  provider: "anthropic" | "openai" | "google" | "zai" | "chatgpt";
  displayName: string;
  description: string;
  tier: "flagship" | "balanced" | "fast";
  inputCreditsPer1k: number;
  outputCreditsPer1k: number;
  baseCost: number;
  maxCreditsPerRequest: number;
  proOnly: boolean;
  /** Minimum plan tier required: free | pro | max. */
  minPlan: PlanTier;
  enabled: boolean;
  isDefault: boolean;
  sort: number;
};

/** Shown under "Recommended · Best at coding" in the model picker. */
export const RECOMMENDED_MODEL_IDS = new Set(["glm-5.2", "chatgpt"]);

// ---------------------------------------------------------------------------
// Unmetered models
// ---------------------------------------------------------------------------

/**
 * Models that cost us nothing per token, so they do NOT draw down the plan
 * token allowance and their usage is excluded from the 5-hour/weekly meters.
 *
 * Today that is ChatGPT, which rides a ChatGPT subscription through the
 * openai-oauth proxy rather than metered API credits. Charging a user's
 * allowance for tokens we never pay for would be arbitrary — and it would
 * make the model's large context useless, since even a Pro 5-hour window is
 * smaller than one full-context call.
 *
 * "Unmetered" means unmetered BY US, not unlimited: the upstream account has
 * its own real rate limits, which UNMETERED_TOKENS_5H below protects.
 */
// Empty since Titan moved to GLM-5.2. The concept stays because it is what
// made an unmetered flagship possible: a model on a flat-rate subscription
// costs nothing per token, so it need not draw on the allowance. Every model
// in the lineup is billed per token now, so every model is metered.
export const UNMETERED_MODEL_IDS = new Set<string>([]);

/**
 * Models that reason long enough that a build genuinely takes minutes, so the
 * chat warns the user rather than letting it look hung. A set of ids, not a
 * name written into the UI: the last version of this had "Sol" hardcoded
 * against glm-5.2, and when glm-5.2 became Titan the app started telling
 * people they were using a model they had not picked.
 */
export const DEEP_THINKING_MODEL_IDS = new Set<string>(["glm-5.2", "glm-4.7"]);

export function isUnmeteredModel(modelId: string): boolean {
  return UNMETERED_MODEL_IDS.has(modelId);
}

/**
 * Fair-use ceiling for unmetered models, per user per rolling 5 hours.
 *
 * The entire site shares ONE upstream ChatGPT subscription, so its rate limit
 * is global. Without this, a single heavy user starves everyone else (and
 * draws attention to an account we would rather keep quiet). Sized to allow
 * roughly two full Max-effort sessions per window.
 */
export const UNMETERED_TOKENS_5H = 750_000;

// ---------------------------------------------------------------------------
// Effort tiers — per model, the user picks how hard (and how expensive) a
// build session may run. `maxCredits` replaces the model's default per-request
// reserve. `minToStart` (where set) lets a session start with less than the
// full cap in the balance: at least that much is required, the reserve is
// then capped at the current balance so the session can never overdraw.
// ---------------------------------------------------------------------------

export type EffortId = "low" | "medium" | "high" | "max" | "unrestricted";

export const EFFORT_IDS: EffortId[] = [
  "low",
  "medium",
  "high",
  "max",
  "unrestricted",
];

/**
 * Efforts only staff may run. Everyone SEES these in the picker (they are
 * part of the product story) but the server refuses them for anyone else —
 * the UI lock is a courtesy, not the control.
 */
export const ADMIN_ONLY_EFFORTS = new Set<EffortId>(["unrestricted"]);

export const DEFAULT_EFFORT: EffortId = "medium";

/** A session's token ceiling at a given effort. */
export type EffortTier = { maxTokens: number };

/**
 * A tier with no token ceiling. The loop compares spend against the budget
 * and stops when it is reached, so an infinite budget simply never stops it.
 *
 * "Unlimited" here means unlimited TOKENS, not unlimited work: the tool loop
 * still caps at ITERATIONS_BY_EFFORT rounds, which is what actually stops a
 * runaway. Only ever set this on an UNMETERED model — on a metered one it
 * would let a single session eat an entire plan allowance in one go.
 */
export const UNLIMITED_SESSION_TOKENS = Number.POSITIVE_INFINITY;

/**
 * Effort tiers are denominated in TOKENS — the same unit as the plan
 * allowances below — so the two systems are directly comparable.
 *
 * TWO ceilings bind every max tier, and the smaller one wins:
 *   1. ~80% of the 5-hour window of the plan that unlocks the model, so a
 *      session can actually finish inside one window.
 *   2. ~80% of the model's own CONTEXT WINDOW — a session that outgrows the
 *      context dies mid-build no matter how much allowance is left.
 *
 *   Luna  (Free, 30k per 5h, 400k ctx)  -> max 26k   (87% of window)
 *   Sol   (Pro,  200k per 5h, 200k ctx) -> max 160k  (80% of both)
 *   Titan (Max,  unmetered,   400k ctx) -> max 300k  (75% of context)
 *
 * Titan is unmetered, so ceiling 1 doesn't apply to it — its context window
 * and the fair-use cap are what bound it.
 */
export const EFFORT_TIERS: Record<
  string,
  Partial<Record<EffortId, EffortTier>>
> = {
  // Luna (ChatGPT 5.5). Sized by the FREE plan window, not the model's
  // context — it has far more context than a free session may spend.
  "chatgpt-5.5": {
    low: { maxTokens: 8_000 },
    medium: { maxTokens: 14_000 },
    high: { maxTokens: 20_000 },
    max: { maxTokens: 26_000 },
  },
  // Retired Luna (GLM), kept in case the row is ever re-enabled.
  "glm-4.7-flash": {
    low: { maxTokens: 8_000 },
    medium: { maxTokens: 14_000 },
    high: { maxTokens: 20_000 },
    max: { maxTokens: 26_000 },
  },
  // Vega
  "glm-5-turbo": {
    low: { maxTokens: 9_000 },
    medium: { maxTokens: 15_000 },
    high: { maxTokens: 21_000 },
    max: { maxTokens: 26_000 },
  },
  // Sol
  "glm-5": {
    low: { maxTokens: 25_000 },
    medium: { maxTokens: 60_000 },
    high: { maxTokens: 110_000 },
    max: { maxTokens: 160_000 },
  },
  // Titan (chatgpt) — unmetered, so the plan window doesn't bind it. Sized
  // against its own 400k context; max sits at 75% so a long session has room
  // to finish rather than hitting the upstream wall mid-build.
  chatgpt: {
    low: { maxTokens: 40_000 },
    medium: { maxTokens: 90_000 },
    high: { maxTokens: 180_000 },
    // Max has no token ceiling. Titan is unmetered, so there is no allowance
    // for a long session to eat; the 96-round tool loop is the backstop.
    max: { maxTokens: UNLIMITED_SESSION_TOKENS },
    unrestricted: { maxTokens: UNLIMITED_SESSION_TOKENS },
  },
  // Vega (Gemini 3.5 Flash) — free rung. Sized by the FREE plan window, not
  // the model's context: it has 1M, a free session may spend 26k of it.
  "gemini-3.5-flash": {
    low: { maxTokens: 8_000 },
    medium: { maxTokens: 14_000 },
    high: { maxTokens: 20_000 },
    max: { maxTokens: 26_000 },
  },
  // Sol (GLM-4.7) — Pro. Inside both its own 200k context and the 200k Pro
  // 5-hour window.
  "glm-4.7": {
    low: { maxTokens: 20_000 },
    medium: { maxTokens: 50_000 },
    high: { maxTokens: 100_000 },
    max: { maxTokens: 150_000 },
  },
  // Sol (glm-5.2) — Pro's model. Previously ran to 800k, which was FOUR TIMES
  // its own 200k context: those sessions could not physically complete. Now
  // capped at 160k, inside both the 200k context and the 200k Pro window.
  // Titan (glm-5.2) — Max. NOT unlimited any more, and that is deliberate:
  // Titan used to be unmetered because it rode a flat-rate subscription, so
  // an uncapped session cost us nothing. On GLM-5.2 every token is billed, so
  // max is capped at what its own 200k context can physically complete.
  "glm-5.2": {
    low: { maxTokens: 25_000 },
    medium: { maxTokens: 60_000 },
    high: { maxTokens: 110_000 },
    max: { maxTokens: 160_000 },
    unrestricted: { maxTokens: 160_000 },
  },
};

/** Fallback session ceiling for a model with no effort table. */
export const DEFAULT_SESSION_TOKENS = 20_000;

/** Effort tier for a model, or null when the model has no effort table. */
export function effortTier(
  modelId: string,
  effort: EffortId,
): EffortTier | null {
  return EFFORT_TIERS[modelId]?.[effort] ?? null;
}

/** Efforts a model actually offers, in display order. */
export function effortIdsFor(modelId: string): EffortId[] {
  const tiers = EFFORT_TIERS[modelId];
  if (!tiers) return [];
  return EFFORT_IDS.filter((id) => tiers[id] != null);
}

/** Tokens a session may consume at a given effort (exact, not an estimate). */
export function effortTokenBudget(
  modelId: string,
  effort: EffortId,
): number | null {
  return effortTier(modelId, effort)?.maxTokens ?? null;
}

/** Context windows (thousands of tokens) for the picker's model info. */
export const MODEL_LIMITS: Record<string, { contextK: number }> = {
  // Luna's real ceiling is the Codex one, same family as Titan. A free
  // session can only spend 26k of it, but the figure shown must be the
  // model's, not the allowance's.
  "chatgpt-5.5": { contextK: 400 },
  "glm-4.7-flash": { contextK: 128 },
  "glm-5-turbo": { contextK: 128 },
  "glm-5": { contextK: 200 },
  "glm-5.2": { contextK: 200 },
  "glm-4.7": { contextK: 200 },
  // Gemini Flash really does take 1M; a free session may spend 26k of it.
  "gemini-3.5-flash": { contextK: 1000 },
  // Real Codex ceiling. The picker advertising more context than the model
  // accepts would surface as a mystery failure mid-build.
  chatgpt: { contextK: 400 },
};

/**
 * Enforced token allowances per plan. The two windows are set independently
 * (weekly is NOT a fixed multiple of the 5-hour figure), so both are listed
 * explicitly and every display reads these constants.
 */
/**
 * Free is sized so one small build actually COMPLETES. The floor is set by
 * the agent loop, not by generosity: system prompt + tool schemas cost
 * ~3-4k tokens per model call before any work, and the loop re-sends the
 * growing context each round, so even a trivial build runs ~20k tokens.
 * Below that a free user only ever sees a half-finished build.
 */
/**
 * MARGIN MATH — why these numbers, so they can be re-derived when prices move.
 *
 * Provider cost per 1M tokens, blended 85% input / 15% output (the agent loop
 * re-sends a growing context every round, so input dominates). Catalog rates
 * are provider price x3, hence the /3:
 *
 *   Luna  (glm-4.7-flash)  ~$0.15 per 1M
 *   Sol   (glm-5.2)        ~$1.95 per 1M
 *   Titan (chatgpt)         $0    — subscription, not metered API
 *
 * Worst case is a user spending their whole weekly cap on the most expensive
 * model their plan unlocks. Monthly = weekly x 4.33.
 *
 *   Free  120k/wk  -> 0.5M/mo on Luna  = ~$0.08/mo   (no revenue; acceptable)
 *   Pro   750k/wk  -> 3.2M/mo on Sol   = ~$6.34 of $19.99  -> 68% margin
 *   Max   2M/wk    -> 8.7M/mo on Sol   = ~$16.90 of $49.99 -> 66% margin
 *
 * Max was 5M/wk, which worst-cased to ~$42 of $49.99 — a 16% margin before
 * Stripe fees, i.e. the tier lost money on anyone who actually used it. Its
 * headline model (Titan) costs us nothing, so the metered allowance only ever
 * needed to cover Sol.
 */
export const TOKEN_LIMITS_5H: Record<PlanTier, number> = {
  free: 30_000,
  pro: 200_000,
  max: 400_000,
};

export const TOKEN_LIMITS_WEEK: Record<PlanTier, number> = {
  free: 120_000,
  pro: 750_000,
  max: 2_000_000,
};

/** 5000 -> "5k", 200000 -> "200k", 1000000 -> "1M". */
export function formatTokenLimit(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return `${Math.round(n / 1000)}k`;
}

export const MODEL_CATALOG: CatalogModel[] = [
  // ---- Live lineup: Vega (free) -> Sol (pro) -> Titan (max) ------------------
  {
    // Luna — the free rung, now on ChatGPT 5.5 through the same Codex OAuth
    // proxy as Titan. Zero rates because a subscription-backed call costs us
    // nothing per token.
    //
    // METERED, unlike Titan, and deliberately so. The constraint here is not
    // our spend, it is that free users and paying Max users draw on ONE shared
    // ChatGPT account: left unmetered, the free tier would eat the rate limit
    // Max subscribers are paying for. The normal free allowance is what keeps
    // that in proportion.
    modelId: "chatgpt-5.5",
    provider: "chatgpt",
    displayName: "Luna (ChatGPT)",
    description: "Fast and free — quick tweaks and small builds",
    tier: "fast",
    inputCreditsPer1k: 0,
    outputCreditsPer1k: 0,
    baseCost: 0,
    maxCreditsPerRequest: 0,
    proOnly: false,
    minPlan: "free",
    // Retired: the Codex proxy proved too unreliable to sit under the free
    // tier. Vega (Gemini 2.5 Flash) takes the rung.
    enabled: false,
    isDefault: false,
    sort: 10,
  },
  {
    // Retired: Luna moved to ChatGPT 5.5. Kept so apply:catalog disables the
    // existing row rather than leaving it live.
    modelId: "glm-4.7-flash",
    provider: "zai",
    displayName: "Luna (GLM)",
    description: "Fast and free — quick tweaks and small builds",
    tier: "fast",
    inputCreditsPer1k: 0.0003,
    outputCreditsPer1k: 0.0012,
    baseCost: 0.001,
    maxCreditsPerRequest: 0.25,
    proOnly: false,
    minPlan: "free",
    enabled: false,
    isDefault: false,
    sort: 99,
  },
  {
    // Retired: the lineup is Luna -> Sol -> Titan, three rungs, one per plan.
    modelId: "glm-5-turbo",
    provider: "zai",
    displayName: "Vega (GLM)",
    description: "Balanced everyday building, free for everyone",
    tier: "balanced",
    inputCreditsPer1k: 0.002,
    outputCreditsPer1k: 0.006,
    baseCost: 0.002,
    maxCreditsPerRequest: 0.4,
    proOnly: false,
    minPlan: "free",
    enabled: false,
    isDefault: false,
    sort: 20,
  },
  {
    // ChatGPT through a Codex OAuth session (see providers/chatgpt.ts), not
    // the paid OpenAI API — hence the zero rates: these columns record what a
    // request COST us, and a subscription-backed call costs nothing per token.
    //
    // Titan — the flagship, Max only. Gated despite costing us nothing: the
    // whole site shares ONE upstream subscription, so the constraint is that
    // account's rate limit, not our spend. Putting it at the top rung keeps
    // the load survivable AND gives Max a headline no competitor tier has —
    // an unmetered model that never touches the allowance they paid for
    // (UNMETERED_MODEL_IDS). It is also why Max's metered cap could come down
    // without hurting real users: the flagship doesn't draw on it.
    modelId: "chatgpt",
    provider: "chatgpt",
    displayName: "Titan (ChatGPT)",
    description:
      "The flagship — biggest context, Creator Store, free of your allowance",
    tier: "flagship",
    inputCreditsPer1k: 0,
    outputCreditsPer1k: 0,
    baseCost: 0,
    maxCreditsPerRequest: 0,
    proOnly: true,
    minPlan: "max",
    // Retired: Titan is GLM-5.2 now.
    enabled: false,
    // Never the default: it depends on a third-party proxy and an account
    // that can be cut off without notice, so a signed-out visitor's first
    // build must not land on it. (It is also Max-gated, so it could not be
    // the default anyway — free users would hit the plan wall immediately.)
    isDefault: false,
    sort: 40,
  },
  {
    // Retired: the name "Sol" moved to glm-5.2, which is strictly better and
    // now carries the Pro tier on its own.
    modelId: "glm-5",
    provider: "zai",
    displayName: "GLM-5",
    description: "Strong builds with Creator Store models",
    tier: "balanced",
    inputCreditsPer1k: 0.003,
    outputCreditsPer1k: 0.0096,
    baseCost: 0.003,
    maxCreditsPerRequest: 0.5,
    proOnly: true,
    minPlan: "pro",
    enabled: false,
    isDefault: false,
    sort: 30,
  },
  {
    modelId: "claude-sonnet-5",
    provider: "anthropic",
    displayName: "Bloxsmith Elite",
    description: "Our most capable model — big, complex builds",
    tier: "flagship",
    inputCreditsPer1k: 0.009,
    outputCreditsPer1k: 0.045,
    baseCost: 0.006,
    maxCreditsPerRequest: 0.7,
    proOnly: true,
    minPlan: "pro",
    enabled: false,
    isDefault: false,
    sort: 95,
  },
  {
    // Retired from the picker — still used internally as the vision bridge
    // (image understanding) for every tier.
    modelId: "claude-haiku-4-5",
    provider: "anthropic",
    displayName: "Blox Mini",
    description: "Quick and cheap for small builds and tweaks",
    tier: "fast",
    inputCreditsPer1k: 0.003,
    outputCreditsPer1k: 0.015,
    baseCost: 0.002,
    maxCreditsPerRequest: 0.25,
    proOnly: false,
    minPlan: "free",
    enabled: false,
    isDefault: false,
    sort: 98,
  },
  {
    // Free-tier Gemini. Note: Google is renaming this to "gemini-3.5-flash";
    // if requests start failing, switch modelId here and re-run apply:catalog.
    modelId: "gemini-3-flash-preview",
    provider: "google",
    displayName: "Gemini 3 Flash",
    description: "Fast and light — quick tweaks and small builds",
    tier: "fast",
    inputCreditsPer1k: 0.0015,
    outputCreditsPer1k: 0.009,
    baseCost: 0.002,
    maxCreditsPerRequest: 0.25,
    proOnly: false,
    minPlan: "free",
    enabled: false,
    isDefault: false,
    sort: 96,
  },
  {
    // $1.4/$4.4 per 1M tokens. The flagship: web search + Creator Store +
    // deep thinking; clearly above everything else in the lineup.
    // Sol — Pro's model. $1.4/$4.4 per 1M tokens: deep thinking, native web
    // search, Creator Store. Moved down from Max because Titan now owns the
    // top rung, and Pro's allowance is sized around this model's cost.
    modelId: "glm-5.2",
    provider: "zai",
    displayName: "Titan",
    description: "The flagship — deep thinking, web search, Creator Store",
    tier: "flagship",
    inputCreditsPer1k: 0.0045,
    outputCreditsPer1k: 0.0135,
    baseCost: 0.004,
    maxCreditsPerRequest: 0.5,
    proOnly: true,
    minPlan: "max",
    enabled: true,
    isDefault: false,
    sort: 40,
  },
  {
    // Vega — the free rung, on a provider we hold our own key for. NOT 2.5
    // Flash: every 2.x Flash returns "no longer available to new users" on a
    // key issued today, so it is listed by the models endpoint and refuses
    // every call. Listing is not availability — check with a real request.
    modelId: "gemini-3.5-flash",
    provider: "google",
    displayName: "Vega",
    description: "Fast and free — quick tweaks and small builds",
    tier: "fast",
    inputCreditsPer1k: 0.001,
    outputCreditsPer1k: 0.008,
    baseCost: 0.001,
    maxCreditsPerRequest: 0.25,
    proOnly: false,
    minPlan: "free",
    enabled: true,
    isDefault: true,
    sort: 10,
  },
  {
    // Retired: every 2.x Flash returns "no longer available to new users" on
    // a key issued today. Kept as a disabled row rather than deleted, because
    // apply:catalog only turns OFF what it can see — renaming the modelId in
    // place left the old row live AND still flagged default, so the picker
    // showed two Vegas.
    modelId: "gemini-2.5-flash",
    provider: "google",
    displayName: "Vega (2.5)",
    description: "Fast and free — quick tweaks and small builds",
    tier: "fast",
    inputCreditsPer1k: 0.001,
    outputCreditsPer1k: 0.008,
    baseCost: 0.001,
    maxCreditsPerRequest: 0.25,
    proOnly: false,
    minPlan: "free",
    enabled: false,
    isDefault: false,
    sort: 97,
  },
  {
    // Sol — Pro's model. GLM-4.7: most of 5.2's build quality at roughly
    // 40% of the token cost, which is what lets Pro's 750k weekly window
    // stay where it is.
    modelId: "glm-4.7",
    provider: "zai",
    displayName: "Sol",
    description: "Strong builds with web search and Creator Store models",
    tier: "balanced",
    inputCreditsPer1k: 0.0019,
    outputCreditsPer1k: 0.007,
    baseCost: 0.002,
    maxCreditsPerRequest: 0.4,
    proOnly: true,
    minPlan: "pro",
    enabled: true,
    isDefault: false,
    sort: 30,
  },
  // ---- Retired from the picker (kept so apply:catalog disables their DB rows)
  {
    modelId: "glm-5.1",
    provider: "zai",
    displayName: "GLM-5.1",
    description: "Strong everyday building",
    tier: "balanced",
    inputCreditsPer1k: 0.0045,
    outputCreditsPer1k: 0.0135,
    baseCost: 0.004,
    maxCreditsPerRequest: 0.5,
    proOnly: false,
    minPlan: "free",
    enabled: false,
    isDefault: false,
    sort: 97,
  },
  {
    modelId: "claude-opus-4-8",
    provider: "anthropic",
    displayName: "Claude Opus 4.8",
    description: "Most capable — complex systems, large multi-step builds",
    tier: "flagship",
    inputCreditsPer1k: 0.015,
    outputCreditsPer1k: 0.075,
    baseCost: 0.012,
    maxCreditsPerRequest: 1.2,
    proOnly: true,
    minPlan: "pro",
    enabled: false,
    isDefault: false,
    sort: 90,
  },
  {
    modelId: "gpt-5.5",
    provider: "openai",
    displayName: "ChatGPT 5.5",
    description: "OpenAI's most capable model",
    tier: "flagship",
    inputCreditsPer1k: 0.015,
    outputCreditsPer1k: 0.09,
    baseCost: 0.012,
    maxCreditsPerRequest: 1.2,
    proOnly: true,
    minPlan: "pro",
    enabled: false,
    isDefault: false,
    sort: 91,
  },
  {
    modelId: "gpt-5.4",
    provider: "openai",
    displayName: "ChatGPT 5.4",
    description: "OpenAI's balanced everyday model",
    tier: "balanced",
    inputCreditsPer1k: 0.0075,
    outputCreditsPer1k: 0.045,
    baseCost: 0.006,
    maxCreditsPerRequest: 0.7,
    proOnly: false,
    minPlan: "free",
    enabled: false,
    isDefault: false,
    sort: 92,
  },
  {
    modelId: "gemini-3-pro-preview",
    provider: "google",
    displayName: "Gemini 3 Pro",
    description: "Google's most capable model — strong reasoning and big builds",
    tier: "flagship",
    inputCreditsPer1k: 0.006,
    outputCreditsPer1k: 0.036,
    baseCost: 0.012,
    maxCreditsPerRequest: 1.2,
    proOnly: true,
    minPlan: "pro",
    enabled: false,
    isDefault: false,
    sort: 93,
  },
  {
    modelId: "glm-4.7-flashx",
    provider: "zai",
    displayName: "GLM-4.7 FlashX",
    description: "Ultra-cheap and fast for small tweaks",
    tier: "fast",
    inputCreditsPer1k: 0.0003,
    outputCreditsPer1k: 0.0012,
    baseCost: 0.001,
    maxCreditsPerRequest: 0.15,
    proOnly: false,
    minPlan: "free",
    enabled: false,
    isDefault: false,
    sort: 94,
  },
];

/** One-time credit packs. `lookupKey` ties a DB product row to its Stripe price. */
export type CreditPack = {
  lookupKey: string;
  name: string;
  description: string;
  credits: number;
  priceUsd: number; // charged in Stripe as cents
  sort: number;
};

export const CREDIT_PACKS: CreditPack[] = [
  {
    lookupKey: "credits_starter",
    name: "Starter",
    description: "A solid pile of builds",
    credits: 20,
    priceUsd: 4.99,
    sort: 10,
  },
  {
    lookupKey: "credits_plus",
    name: "Plus",
    description: "Best for regular building — 25% bonus",
    credits: 75,
    priceUsd: 14.99,
    sort: 20,
  },
  {
    lookupKey: "credits_pro_pack",
    name: "Builder",
    description: "Best value for heavy building",
    credits: 200,
    priceUsd: 39.99,
    sort: 30,
  },
];

/** The Pro subscription. Monthly credits cap our provider-cost exposure. */
export const PRO_PLAN = {
  lookupKey: "pro_monthly",
  name: "Pro",
  priceUsd: 19.99,
  monthlyCredits: 20,
  perks: [
    "Unlocks Sol — deep thinking, web search, Creator Store models",
    "Insert Creator Store models (trees, props, vehicles)",
    "A far bigger build allowance",
    "Priority on new models",
  ],
} as const;

/** The Max subscription — the top tier, unlocks Titan. */
export const MAX_PLAN = {
  lookupKey: "max_monthly",
  name: "Max",
  priceUsd: 49.99,
  monthlyCredits: 60,
  perks: [
    "Unlocks Titan — our flagship, with the biggest context we offer",
    "Titan builds never touch your allowance",
    "Everything in Pro, including Creator Store models",
    "First access to every new model and tool",
  ],
} as const;

/** Runtime settings defaults (app_settings). */
export const APP_SETTINGS_DEFAULTS: { key: string; value: unknown }[] = [
  { key: "fulfillment_mode", value: "stripe" }, // "stripe" | "manual"
  { key: "run_luau_enabled", value: false },
  { key: "signup_grant_credits", value: 1 },
  { key: "default_model_id", value: "chatgpt-5.5" },
  { key: "max_attachment_bytes", value: 5 * 1024 * 1024 },
  { key: "pro_monthly_credits", value: PRO_PLAN.monthlyCredits },
  { key: "max_monthly_credits", value: MAX_PLAN.monthlyCredits },
  // Stripe price ids are filled in by scripts/stripe-setup.ts:
  { key: "stripe_pro_price_id", value: "" },
  { key: "stripe_max_price_id", value: "" },
  // Kill switch for token-allowance enforcement (true = limits enforced).
  { key: "token_metering_enabled", value: true },
];
