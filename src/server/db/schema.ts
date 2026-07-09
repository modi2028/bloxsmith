import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["user", "admin", "super_admin"]);

export const userPlan = pgEnum("user_plan", ["free", "pro"]);

export const creditTxKind = pgEnum("credit_tx_kind", [
  "signup_grant", // automatic grant on first login
  "admin_adjustment", // admin manually added/removed credits (audited)
  "purchase", // fulfilled via payment webhook
  "redeem", // redemption code
  "reserve", // negative hold placed when an AI request starts
  "settle", // positive correction: reserved minus actual usage
  "refund", // full refund of a reserve after a failed request
  "daily_reward", // daily login reward claim (streak-based)
]);

export const providerName = pgEnum("provider_name", [
  "anthropic",
  "google",
  "openai",
  "zai", // Z.ai (Zhipu) GLM models via their OpenAI-compatible API
]);

export const toolCallStatus = pgEnum("tool_call_status", [
  "pending", // waiting for the plugin to pick it up
  "claimed", // plugin fetched it and is executing
  "done", // result posted
  "error", // plugin reported failure
  "expired", // deadline passed without a result
  "cancelled", // request aborted / user stopped the run
]);

export const aiRequestStatus = pgEnum("ai_request_status", [
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const chatRole = pgEnum("chat_role", ["user", "assistant", "system"]);

// ---------------------------------------------------------------------------
// Identity & sessions
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    robloxUserId: bigint("roblox_user_id", { mode: "number" })
      .notNull()
      .unique(),
    username: text("username").notNull(),
    displayName: text("display_name"),
    // What the AI (and the UI greeting) should call the user — user-editable.
    nickname: text("nickname"),
    avatarUrl: text("avatar_url"),
    role: userRole("role").notNull().default("user"),
    // Model ids this user is banned from using (admin-managed).
    bannedModels: jsonb("banned_models").$type<string[]>().notNull().default([]),
    // Subscription plan. Pro unlocks pro_only models + monthly credit grant.
    plan: userPlan("plan").notNull().default("free"),
    // When Pro lapses (null = permanent, e.g. admin-granted). Enforced live.
    proExpiresAt: timestamp("pro_expires_at", { withTimezone: true }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    // TOTP secret for admin 2FA, AES-256-GCM encrypted (see server/crypto).
    totpSecretEnc: text("totp_secret_enc"),
    // Admin-adjustable per-user spending caps, in credits. NULL = no cap.
    dailySpendLimit: numeric("daily_spend_limit", {
      precision: 14,
      scale: 4,
      mode: "number",
    }),
    monthlySpendLimit: numeric("monthly_spend_limit", {
      precision: 14,
      scale: 4,
      mode: "number",
    }),
    // Per-user override of the global run_luau setting. NULL = follow global.
    allowRunLuau: boolean("allow_run_luau"),
    // Roblox account creation date (cached from the Roblox users API); the
    // daily reward requires a 6-month-old account to deter alt farming.
    robloxCreatedAt: timestamp("roblox_created_at", { withTimezone: true }),
    // Daily login reward: consecutive-day streak + the UTC day ("YYYY-MM-DD")
    // of the last claim. Missing a day resets the streak.
    rewardStreak: integer("reward_streak").notNull().default(0),
    rewardLastClaimDay: text("reward_last_claim_day"),
    disabled: boolean("disabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("users_roblox_id_idx").on(t.robloxUserId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    // Admin routes additionally require a fresh TOTP verification.
    adminVerifiedUntil: timestamp("admin_verified_until", {
      withTimezone: true,
    }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// Short-lived state for the Roblox OAuth authorization-code + PKCE flow.
export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  codeVerifier: text("code_verifier").notNull(),
  redirectTo: text("redirect_to"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Plugin pairing
// ---------------------------------------------------------------------------

export const pairingCodes = pgTable("pairing_codes", {
  code: text("code").primaryKey(), // short human-typable code shown on the site
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Zoho mailboxes connected to the admin webmail. The OAuth refresh token is
 * AES-encrypted at rest; minRole gates who can open the mailbox (admins get
 * support@, super admins also get management@).
 */
export const mailAccounts = pgTable("mail_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  address: text("address").notNull().unique(),
  zohoAccountId: text("zoho_account_id").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  minRole: text("min_role", { enum: ["admin", "super_admin"] })
    .notNull()
    .default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const connectRequestStatus = pgEnum("connect_request_status", [
  "pending", // waiting for the website user to approve
  "approved", // approved on the site; token not yet delivered to the plugin
  "denied", // declined on the site
  "consumed", // token delivered to the plugin
]);

/**
 * Studio-initiated auto-connect: the plugin reports the Roblox user id logged
 * into Studio; the matching signed-in website user approves with one click,
 * then the plugin exchanges its request secret for a long-lived plugin token.
 * The secret never leaves the initiating plugin, so an approval can only ever
 * hand the token to the Studio instance that asked.
 */
export const pluginConnectRequests = pgTable(
  "plugin_connect_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    placeName: text("place_name"),
    secretHash: text("secret_hash").notNull().unique(),
    status: connectRequestStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("plugin_connect_requests_user_idx").on(t.userId, t.createdAt)],
);

export const pluginTokens = pgTable(
  "plugin_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    label: text("label"), // e.g. "Desktop – Studio", editable by the user
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // Updated on every poll; powers the "plugin connected" indicator.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("plugin_tokens_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Credits — append-only ledger. Balance is always SUM(delta); never mutate a
// running total. Admin adjustments reference the acting admin for the audit
// trail. Spending uses reserve -> settle/refund so concurrent requests cannot
// overdraw.
// ---------------------------------------------------------------------------

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Credits; negative = debit. Fractional (numeric) — a request can cost
    // e.g. 0.1275 credits.
    delta: numeric("delta", { precision: 14, scale: 4, mode: "number" })
      .notNull(),
    kind: creditTxKind("kind").notNull(),
    reason: text("reason"),
    // Loose reference to whatever caused this row:
    //   ai_request | product | redemption_code | admin
    refType: text("ref_type"),
    refId: text("ref_id"),
    // Set for admin_adjustment rows.
    actorUserId: uuid("actor_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("credit_tx_user_idx").on(t.userId),
    index("credit_tx_user_created_idx").on(t.userId, t.createdAt),
    index("credit_tx_ref_idx").on(t.refType, t.refId),
  ],
);

// ---------------------------------------------------------------------------
// Model catalog & pricing — "better models = more credits" lives here.
// Rates are credits per 1K tokens (fractional), plus a flat per-request base
// cost. Final charge = ceil(base + in_tokens/1000*inputRate +
// out_tokens/1000*outputRate). Rows are admin-editable.
// ---------------------------------------------------------------------------

export const modelPricing = pgTable(
  "model_pricing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: text("model_id").notNull().unique(), // e.g. "claude-opus-4-8"
    provider: providerName("provider").notNull(),
    displayName: text("display_name").notNull(), // e.g. "Claude Opus 4.8"
    description: text("description"), // shown in the model picker
    tier: text("tier"), // e.g. "flagship" | "balanced" | "fast" (UI hint)
    inputCreditsPer1k: numeric("input_credits_per_1k", {
      precision: 10,
      scale: 4,
    }).notNull(),
    outputCreditsPer1k: numeric("output_credits_per_1k", {
      precision: 10,
      scale: 4,
    }).notNull(),
    baseCost: numeric("base_cost", { precision: 14, scale: 4, mode: "number" })
      .notNull()
      .default(0),
    // Cap used to size the credit reserve for one request on this model.
    maxCreditsPerRequest: numeric("max_credits_per_request", {
      precision: 14,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(1),
    // Requires an active Pro subscription (or admin) to use.
    proOnly: boolean("pro_only").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("model_pricing_enabled_idx").on(t.enabled, t.sort)],
);

// ---------------------------------------------------------------------------
// Provider API keys — encrypted at rest, write-only via the admin API.
// Only key_last4 is ever returned to a client.
// ---------------------------------------------------------------------------

export const providerKeys = pgTable("provider_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: providerName("provider").notNull().unique(),
  encryptedKey: text("encrypted_key").notNull(), // AES-256-GCM envelope
  keyLast4: text("key_last4").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  priceDisplay: text("price_display").notNull(), // e.g. "$4.99"
  // Legacy static payment link (unused when Stripe Checkout is configured).
  paymentLinkUrl: text("payment_link_url"),
  // Stripe Price id (created by scripts/stripe-setup.ts) + lookup key.
  stripePriceId: text("stripe_price_id"),
  lookupKey: text("lookup_key").unique(),
  credits: numeric("credits", { precision: 14, scale: 4, mode: "number" })
    .notNull(),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const redemptionCodes = pgTable(
  "redemption_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeHash: text("code_hash").notNull().unique(),
    credits: numeric("credits", { precision: 14, scale: 4, mode: "number" })
      .notNull()
      .default(0),
    // Optionally also grant Pro for N days on redemption.
    grantsPro: boolean("grants_pro").notNull().default(false),
    proDays: integer("pro_days"),
    active: boolean("active").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    redeemedBy: uuid("redeemed_by").references(() => users.id),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("redemption_codes_active_idx").on(t.active)],
);

// Raw payment webhook events, stored before processing so fulfillment is
// idempotent and replayable.
export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull(), // "stripe" | ...
  externalId: text("external_id").notNull().unique(), // provider event id
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Chat / projects
// ---------------------------------------------------------------------------

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New project"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    lastModelId: text("last_model_id"),
    // Plugin-side instance ref registry snapshot (ref -> debug path), so a
    // resumed conversation can re-validate which refs still exist.
    instanceRefs: jsonb("instance_refs"),
    // Rolling model-maintained project notes fed into the system context.
    projectMemory: text("project_memory"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("chat_sessions_user_idx").on(t.userId, t.archivedAt)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: chatRole("role").notNull(),
    // Full provider-agnostic content blocks (text / tool_use / tool_result),
    // used to rebuild model context when resuming.
    content: jsonb("content").notNull(),
    // Plain text projection for list views and search.
    textContent: text("text_content"),
    modelId: text("model_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("chat_messages_session_idx").on(t.sessionId, t.createdAt)],
);

// Drag-and-dropped image references. Files live in a private Supabase Storage
// bucket; this table holds metadata + ownership. messageId is set when the
// message that used the attachment is sent (until then it's an orphan that a
// cleanup job may delete).
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => chatMessages.id, {
      onDelete: "set null",
    }),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(), // image/png, image/jpeg, image/webp, image/gif
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("attachments_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// AI requests — one row per user turn through the agent loop. The ledger's
// reserve/settle rows point here via refType="ai_request".
// ---------------------------------------------------------------------------

export const aiRequests = pgTable(
  "ai_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    modelId: text("model_id").notNull(),
    status: aiRequestStatus("status").notNull().default("running"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    creditsReserved: numeric("credits_reserved", {
      precision: 14,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(0),
    creditsCharged: numeric("credits_charged", {
      precision: 14,
      scale: 4,
      mode: "number",
    })
      .notNull()
      .default(0),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("ai_requests_user_idx").on(t.userId, t.createdAt),
    index("ai_requests_session_idx").on(t.sessionId),
  ],
);

// ---------------------------------------------------------------------------
// Tool-call queue (chat -> Studio bridge)
// ---------------------------------------------------------------------------

export const toolCallQueue = pgTable(
  "tool_call_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aiRequestId: uuid("ai_request_id")
      .notNull()
      .references(() => aiRequests.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    args: jsonb("args").notNull(),
    contractVersion: integer("contract_version").notNull().default(1),
    status: toolCallStatus("status").notNull().default("pending"),
    result: jsonb("result"),
    error: text("error"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The plugin's poll query: pending calls for this user, oldest first.
    index("tool_queue_poll_idx").on(t.userId, t.status, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(), // e.g. "credits.adjust", "keys.set"
    targetType: text("target_type"), // "user" | "product" | "provider_key" | ...
    targetId: text("target_id"),
    // Sensitive fields must be masked before writing (never log raw keys).
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_actor_idx").on(t.actorUserId, t.createdAt)],
);

// Global runtime settings editable from the admin panel:
//   fulfillment_mode: "webhook" | "manual"
//   run_luau_enabled: boolean (global default; users.allowRunLuau overrides)
//   signup_grant_credits: number
//   default_model_id: string
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
