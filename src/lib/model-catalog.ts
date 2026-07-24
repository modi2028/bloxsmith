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
export const RECOMMENDED_MODEL_IDS = new Set(["glm-5", "glm-5.2"]);

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
export const UNMETERED_MODEL_IDS = new Set(["chatgpt"]);

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
export const UNMETERED_TOKENS_5H = 500_000;

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
 * Effort tiers are denominated in TOKENS — the same unit as the plan
 * allowances below — so the two systems are directly comparable. Each tier is
 * sized against the window of the plan that unlocks the model, so a single
 * session can never promise more than the window can actually deliver:
 *
 *   Luna/Vega  (Free, 30k per 5h)   -> max session 26k   (~85%, one real build)
 *   Sol        (Pro,  200k per 5h)  -> max session 160k  (~80%)
 *   Titan      (Max,  1M per 5h)    -> max session 800k  (~80%)
 *
 * Not every model offers every effort (Titan is Low or Max, nothing between).
 */
export const EFFORT_TIERS: Record<
  string,
  Partial<Record<EffortId, EffortTier>>
> = {
  // Luna
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
  // ChatGPT — unmetered, so these tiers are sized against the model's own
  // 400k context and the UNMETERED_TOKENS_5H fair-use window rather than
  // against a plan allowance. Max stays comfortably under the context limit
  // so a long session doesn't run into a hard upstream wall mid-build.
  chatgpt: {
    low: { maxTokens: 40_000 },
    medium: { maxTokens: 90_000 },
    high: { maxTokens: 160_000 },
    max: { maxTokens: 260_000 },
  },
  // Titan — Low for quick work, Max for the full flagship experience, plus
  // the staff-only unrestricted mode.
  "glm-5.2": {
    low: { maxTokens: 120_000 },
    max: { maxTokens: 800_000 },
    unrestricted: { maxTokens: 800_000 },
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
  "glm-4.7-flash": { contextK: 128 },
  "glm-5-turbo": { contextK: 128 },
  "glm-5": { contextK: 200 },
  "glm-5.2": { contextK: 200 },
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
export const TOKEN_LIMITS_5H: Record<PlanTier, number> = {
  free: 30_000,
  pro: 200_000,
  max: 1_000_000,
};

export const TOKEN_LIMITS_WEEK: Record<PlanTier, number> = {
  free: 120_000,
  pro: 750_000,
  max: 5_000_000,
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
  // ---- Live lineup: Luna -> Vega -> Sol -> Titan -----------------------------
  {
    modelId: "glm-4.7-flash",
    provider: "zai",
    displayName: "Luna",
    description: "Fast and free — quick tweaks and small builds",
    tier: "fast",
    inputCreditsPer1k: 0.0003,
    outputCreditsPer1k: 0.0012,
    baseCost: 0.001,
    maxCreditsPerRequest: 0.25,
    proOnly: false,
    minPlan: "free",
    enabled: true,
    isDefault: true,
    sort: 10,
  },
  {
    modelId: "glm-5-turbo",
    provider: "zai",
    displayName: "Vega",
    description: "Balanced everyday building, free for everyone",
    tier: "balanced",
    inputCreditsPer1k: 0.002,
    outputCreditsPer1k: 0.006,
    baseCost: 0.002,
    maxCreditsPerRequest: 0.4,
    proOnly: false,
    minPlan: "free",
    enabled: true,
    isDefault: false,
    sort: 20,
  },
  {
    // ChatGPT through a Codex OAuth session (see providers/chatgpt.ts), not
    // the paid OpenAI API — hence the zero rates: these columns record what a
    // request COST us, and a subscription-backed call costs nothing per token.
    //
    // Pro-gated despite costing us nothing: the whole site shares ONE upstream
    // subscription, so the constraint is that account's rate limit, not our
    // spend. Restricting it to paid plans keeps the load survivable and makes
    // it a genuine perk — an unmetered model that never touches the allowance
    // Pro and Max users actually paid for (UNMETERED_MODEL_IDS).
    modelId: "chatgpt",
    provider: "chatgpt",
    displayName: "ChatGPT",
    description:
      "OpenAI's ChatGPT — Creator Store models, free of your allowance",
    tier: "flagship",
    inputCreditsPer1k: 0,
    outputCreditsPer1k: 0,
    baseCost: 0,
    maxCreditsPerRequest: 0,
    proOnly: true,
    minPlan: "pro",
    enabled: true,
    // Never the default: it depends on a third-party proxy and an account
    // that can be cut off without notice, so a signed-out visitor's first
    // build must not land on it. (It is also Pro-gated, so it could not be
    // the default anyway — free users would hit the plan wall immediately.)
    isDefault: false,
    sort: 25,
  },
  {
    // GLM-5: $1.0/$3.2 per 1M tokens.
    modelId: "glm-5",
    provider: "zai",
    displayName: "Sol",
    description: "Strong builds with Creator Store models",
    tier: "balanced",
    inputCreditsPer1k: 0.003,
    outputCreditsPer1k: 0.0096,
    baseCost: 0.003,
    maxCreditsPerRequest: 0.5,
    proOnly: true,
    minPlan: "pro",
    enabled: true,
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
    modelId: "glm-5.2",
    provider: "zai",
    displayName: "Titan",
    description:
      "The flagship — deep thinking, web search, Creator Store models",
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
    "Unlocks Sol — strong builds with real Creator Store models",
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
    "Unlocks Titan — the flagship with deep thinking and web search",
    "Everything in Pro, including Creator Store models",
    "The largest build allowance we offer",
    "First access to every new model and tool",
  ],
} as const;

/** Runtime settings defaults (app_settings). */
export const APP_SETTINGS_DEFAULTS: { key: string; value: unknown }[] = [
  { key: "fulfillment_mode", value: "stripe" }, // "stripe" | "manual"
  { key: "run_luau_enabled", value: false },
  { key: "signup_grant_credits", value: 1 },
  { key: "default_model_id", value: "glm-4.7-flash" },
  { key: "max_attachment_bytes", value: 5 * 1024 * 1024 },
  { key: "pro_monthly_credits", value: PRO_PLAN.monthlyCredits },
  { key: "max_monthly_credits", value: MAX_PLAN.monthlyCredits },
  // Stripe price ids are filled in by scripts/stripe-setup.ts:
  { key: "stripe_pro_price_id", value: "" },
  { key: "stripe_max_price_id", value: "" },
  // Kill switch for token-allowance enforcement (true = limits enforced).
  { key: "token_metering_enabled", value: true },
];
