# Bloxsmith

**Your AI pair-builder for Roblox Studio.** Describe a game mechanic in a chat
box on the web; a companion Studio plugin executes the build live in your open
Roblox Studio session.

```
[Browser: chat / store / admin]
        | session cookie
        v
[Next.js backend]  <-- encrypted provider keys, credit ledger,
        |              tool-call queue (Supabase Postgres)
        | agentic loop (Claude / Gemini with Studio tools)
        v
[tool_call_queue]  <-- Studio plugin polls (~1s), executes in the
                       DataModel, POSTs structured results back
```

## Status

Phase 1 of 10 — scaffold, database schema, secrets handling, brand, app shell.
See [Build plan](#build-plan).

## Stack

- **Next.js (App Router) + TypeScript + Tailwind** — frontend and backend in
  one deployable. Deploy as a **long-running Node process** (Docker /
  Railway / Fly / VPS): agent-loop turns hold requests open for minutes, which
  rules out short serverless timeouts.
- **Supabase Postgres via Drizzle ORM**, accessed server-side only (RLS
  deny-all; the browser never talks to Supabase directly). Supabase Storage
  holds chat image attachments.
- **Own Roblox OAuth 2.0 (PKCE) + httpOnly cookie sessions** — no Supabase
  Auth.
- **Claude + Gemini** behind one provider interface; all model calls are
  proxied server-side. The browser and the plugin never see a provider key.
- **Luau Studio plugin** (Rojo project in `plugin/`, from Phase 4).

## Setup

1. **Install deps**

   ```sh
   npm install
   ```

2. **Create a Supabase project** (or reuse one). From the dashboard collect:
   - the **transaction pooler** connection string (port 6543) → `DATABASE_URL`
   - project URL + service-role key → `SUPABASE_URL`,
     `SUPABASE_SERVICE_ROLE_KEY`

3. **Configure env**

   ```sh
   cp .env.example .env.local
   openssl rand -base64 32   # -> MASTER_ENCRYPTION_KEY
   openssl rand -base64 32   # -> SESSION_SECRET
   ```

4. **Register the Roblox OAuth app** at
   [create.roblox.com/dashboard/credentials](https://create.roblox.com/dashboard/credentials):
   - scopes: `openid`, `profile`
   - redirect URL: `http://localhost:3000/api/auth/roblox/callback`
   - copy client ID + secret into `.env.local`

   > Unreviewed Roblox OAuth apps are limited to **10 unique users** (private
   > mode) until Roblox approves the app. The registering account must be
   > ID-verified; only 13+ users can authorize apps.

5. **Apply schema + seed defaults**

   ```sh
   npm run db:migrate   # applies drizzle/ migrations to DATABASE_URL
   npm run db:seed      # default model pricing + app settings (idempotent)
   ```

6. **Run**

   ```sh
   npm run dev
   ```

## Scripts

| Script                | What it does                                      |
| --------------------- | ------------------------------------------------- |
| `npm run dev`         | Dev server                                        |
| `npm run build/start` | Production build / serve                          |
| `npm test`            | Unit tests (crypto vault, and growing)            |
| `npm run db:generate` | Regenerate SQL migrations after schema changes    |
| `npm run db:migrate`  | Apply migrations to `DATABASE_URL`                |
| `npm run db:seed`     | Seed model pricing + settings (skips existing)    |
| `npm run chatgpt:models` | List models the ChatGPT OAuth session can reach |

## The ChatGPT model (openai-oauth)

The `chatgpt` model is **not** the paid OpenAI API. It rides a ChatGPT
subscription through [openai-oauth](https://github.com/EvanZhouDev/openai-oauth),
an unofficial proxy that re-exposes a Codex OAuth session as an
OpenAI-compatible endpoint. Read this before touching it:

> **The mechanism is tolerated; our deployment shape is the exposed part.**
> Unlike Anthropic (Feb 2026) and Google's Gemini CLI (Feb 2026), OpenAI has
> not restricted Codex OAuth tokens in third-party clients, so using them is
> not in itself a terms breach. What openai-oauth *does* rule out is how we
> use it: its README says to keep it to "personal, local experimentation",
> and to "not run as a hosted service, do not share access, and do not pool
> or redistribute tokens." One account serving every user of this site is
> precisely that, and OpenAI has revoked third-party OAuth apps before (it
> pulled OpenClaw's permission and then rejected its logins outright).
>
> Practical consequence: the account behind this can be cut off without
> warning. Treat it as expendable, keep it off the default model, and make
> sure another model can take over — which is what the fallbacks below do.

**Running it.** The proxy is a separate process that must be reachable from
the app:

```sh
npx openai-oauth@latest login     # one-time, opens a ChatGPT sign-in
npx openai-oauth@latest --detach  # serves http://127.0.0.1:10531/v1
```

In Docker it has to be a sidecar (or run in the same container with a
supervisor) — the app does **not** start it. If it's down, `chatgpt` requests
fail with an "offline" notice and every other model keeps working.

**Config.**

| Env var                | Default                     | What it does                          |
| ---------------------- | --------------------------- | ------------------------------------- |
| `CHATGPT_OAUTH_BASE`   | `http://127.0.0.1:10531/v1` | Where the proxy listens               |
| `CHATGPT_OAUTH_MODEL`  | `gpt-5.5`                   | Upstream model actually requested     |

Which models an account can reach depends on its ChatGPT plan and changes over
time, so `CHATGPT_OAUTH_MODEL` is config, not code — our catalog id
(`chatgpt`) is deliberately decoupled from it. Run `npm run chatgpt:models` to
see what the connected account actually offers; the script warns if the
configured model isn't in the list.

**Metering.** Subscription-backed tokens cost us nothing, so `chatgpt` is
listed in `UNMETERED_MODEL_IDS`: it never draws down a plan's token allowance
and is excluded from the 5-hour/weekly meters (charging a user for tokens we
don't pay for would be arbitrary, and a free plan's whole window is smaller
than one full-context call). Unmetered by us is not unlimited — a per-user
fair-use ceiling of `UNMETERED_TOKENS_5H` protects the shared upstream
account, and unlike the plan gate it has no admin bypass and no kill switch.

## Credits system

Everything money-shaped is an append-only ledger (`credit_transactions`);
balance is always `SUM(delta)`. Spending is **reserve → settle/refund**: a
request reserves the model's `max_credits_per_request` up front (inside a
transaction with the user row locked, so concurrent requests can't overdraw),
then settles to actual token usage on completion or refunds fully on failure.

- **Better models cost more** — `model_pricing` holds per-model
  input/output credit rates + a base cost, all editable in the admin panel.
  Defaults are seeded tiered: Opus 4.8 > Sonnet 5 > Haiku 4.5.
- **Admin credit controls** — adjust any user's balance (audited
  `admin_adjustment` rows) and set per-user `daily_spend_limit` /
  `monthly_spend_limit` caps, enforced at reserve time.
- Purchases (webhook) and redemption codes append `purchase` / `redeem` rows.

## Security model (summary)

- Provider API keys: AES-256-GCM at rest (`src/server/crypto`), write-only
  admin API, masked display (`…last4`), decrypted in-memory only at call time.
- Admin: env allowlist of Roblox user IDs **and** TOTP verification on top of
  login, optional IP allowlist, every action audited (`admin_audit_log`).
- Sessions and plugin tokens stored as SHA-256 hashes; plugin tokens are
  revocable per device.
- `run_luau` tool is off by default (global setting + per-user override).

## Repo layout

```
drizzle/            generated SQL migrations
docs/               tool-contract.md, context-design.md
src/app/            routes (App Router) — UI + /api/*
src/components/     UI components
src/lib/            shared types, zod schemas, brand config
src/server/         backend-only code (env, db, crypto, credits, ai, bridge)
plugin/             Luau Studio plugin (Rojo) — from Phase 4
```

## Build plan

1. ✅ Scaffold, schema, env/secrets, brand, app shell
2. Roblox OAuth login/logout + sessions + roles
3. AI proxy + agentic tool-loop (Claude) with a mocked plugin + queue contract
4. Studio plugin MVP: pairing, polling, core tools
5. Chat UI with streaming + live tool-call activity, wired end-to-end
6. Credits ledger enforcement + balance display
7. Store + fulfillment (codes first, then Stripe webhook)
8. Admin panel with full hardening
9. Gemini provider behind the same tool-loop interface
10. Polish: rate limits, audit coverage, docs, deploy guide
