/**
 * Single source of truth for model pricing/plans, credit packs, and the Pro
 * plan. Plain module (no server-only) so both the seed/apply scripts and the
 * app can import it.
 *
 * PRICING MODEL — profitability:
 *   1 credit ≈ $1 (packs are ~$1 / credit). Credits are FRACTIONAL: a typical
 *   request costs ~0.1–0.5 credits. Rates below = provider $/1k tokens × 3
 *   → ~3x markup on raw provider cost, i.e. ~67% gross margin on usage before
 *   Stripe/infra. Everything here is admin-editable at runtime.
 */

export type CatalogModel = {
  modelId: string;
  provider: "anthropic" | "openai" | "google" | "zai";
  displayName: string;
  description: string;
  tier: "flagship" | "balanced" | "fast";
  inputCreditsPer1k: number;
  outputCreditsPer1k: number;
  baseCost: number;
  maxCreditsPerRequest: number;
  proOnly: boolean;
  enabled: boolean;
  isDefault: boolean;
  sort: number;
};

/** Shown under "Recommended · Best at coding" in the model picker. */
export const RECOMMENDED_MODEL_IDS = new Set(["glm-5", "glm-5.2"]);

export const MODEL_CATALOG: CatalogModel[] = [
  // ---- Live lineup -----------------------------------------------------------
  {
    // GLM-5: $1.0/$3.2 per 1M tokens -> x3 markup. Free-tier coding pick.
    modelId: "glm-5",
    provider: "zai",
    displayName: "Blox Lite",
    description: "Strong everyday building for free",
    tier: "balanced",
    inputCreditsPer1k: 0.003,
    outputCreditsPer1k: 0.0096,
    baseCost: 0.003,
    maxCreditsPerRequest: 0.4,
    proOnly: false,
    enabled: true,
    isDefault: false,
    sort: 10,
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
    enabled: false,
    isDefault: false,
    sort: 95,
  },
  {
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
    enabled: true,
    isDefault: true,
    sort: 20,
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
    enabled: false,
    isDefault: false,
    sort: 96,
  },
  {
    // $1.4/$4.4 per 1M tokens -> x3 markup.
    modelId: "glm-5.2",
    provider: "zai",
    displayName: "Blox Pro",
    description: "Our most capable model — big, complex builds",
    tier: "flagship",
    inputCreditsPer1k: 0.0045,
    outputCreditsPer1k: 0.0135,
    baseCost: 0.004,
    maxCreditsPerRequest: 0.5,
    proOnly: true,
    enabled: true,
    isDefault: false,
    sort: 15,
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
    description: "A solid handful of builds",
    credits: 5,
    priceUsd: 4.99,
    sort: 10,
  },
  {
    lookupKey: "credits_plus",
    name: "Plus",
    description: "Best for regular building — 20% bonus",
    credits: 18,
    priceUsd: 14.99,
    sort: 20,
  },
  {
    lookupKey: "credits_pro_pack",
    name: "Builder",
    description: "Best value for heavy building",
    credits: 55,
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
    "Unlocks Blox Pro — our most capable model",
    "Insert real Creator Store models (trees, props, vehicles)",
    "20 credits every month",
    "Priority on new models",
  ],
} as const;

/** Runtime settings defaults (app_settings). */
export const APP_SETTINGS_DEFAULTS: { key: string; value: unknown }[] = [
  { key: "fulfillment_mode", value: "stripe" }, // "stripe" | "manual"
  { key: "run_luau_enabled", value: false },
  { key: "signup_grant_credits", value: 1 },
  { key: "default_model_id", value: "claude-haiku-4-5" },
  { key: "max_attachment_bytes", value: 5 * 1024 * 1024 },
  { key: "pro_monthly_credits", value: PRO_PLAN.monthlyCredits },
  // Stripe price ids are filled in by scripts/stripe-setup.ts:
  { key: "stripe_pro_price_id", value: "" },
];
