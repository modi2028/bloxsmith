# Token backend plan — replacing credits with token allowances

Status: **PLAN — not built.** Decided limits and mechanics below; build after
sign-off. Until then, credits remain the real meter and the token readouts in
the UI are informational.

## The model

Users no longer buy or spend credits. Each plan grants a **token allowance**
over a **rolling 5-hour window**, plus a **weekly cap**. Usage is metered on
real tokens (input + output, which includes thinking — exactly what
`ai_requests.input_tokens/output_tokens` already record per run).

| Plan | Per 5 rolling hours | Per week (5h x 4) |
| ---- | ------------------- | ----------------- |
| Free | 250k tokens         | 1M tokens         |
| Pro  | 1M tokens           | 4M tokens         |
| Max  | 2.5M tokens         | 10M tokens        |

These constants already exist in code: `TOKEN_LIMITS_5H` and
`WEEKLY_MULTIPLIER` in `src/lib/model-catalog.ts`.

Token spend naturally scales with model, effort, and task size — a Titan Max
session burns the allowance far faster than a Luna Low tweak, which replaces
the old per-model credit prices without any price table.

## What already exists (shipped ahead of the cutover)

- `ai_requests` rows record tokens per run with timestamps — the meter is
  already being written on every request.
- `src/server/token-usage.ts` — `tokenWindowUsage()` computes 5-hour and
  weekly usage + percentages from those rows.
- The chat UI shows a live token counter during runs and "% of your 5-hour
  limit" after each run.
- The store already sells plans (Pro/Max), not credits.

## Build steps (in order)

1. **Enforcement gate in the loop.** In `runAgentTurn`, before reserving
   anything: `tokenWindowUsage(user.id, plan, now)` — if `used >= limit`
   (5-hour) OR `weeklyUsed >= weeklyLimit`, refuse the run with a friendly
   error that says when the window frees up (compute the oldest request
   timestamp inside the window + 5h; for weekly, + 7 days). Weekly overage
   blocks chat entirely per spec.
2. **Session budget = tokens, not credits.** Replace the effort tiers'
   `maxCredits`/`minToStart` with `maxTokens`/`minTokensToStart`
   (same UX: the mid-run budget guard compares `inputTokens + outputTokens`
   against the tier's token cap; min-to-start compares remaining window
   allowance). Delete the reserve/settle/refund calls from the loop.
3. **Freeze the credit ledger.** Keep `credit_transactions` (history, admin
   audit) but stop writing spend rows. Keep `grantCredits` only for legacy
   redemption codes until those are migrated to plan-grant codes.
4. **Migrate side features off credits.**
   - Daily login rewards: grant bonus *tokens* (a `token_bonuses` table:
     userId, amount, expiresAt, reason) added to the window allowance, or
     switch rewards to cosmetic/streak-only. Decision needed.
   - Blox Image + Better Prompter + Blox Chat: meter their tokens into the
     same window (they already run through providers that report usage).
   - Admin credit adjustments → admin token-bonus adjustments.
5. **Store cutover already done** (plans only). Remove the remaining balance
   chips in the header/composer, replace with a small allowance meter
   (5-hour % + weekly %), fed by a `GET /api/me/usage` endpoint wrapping
   `tokenWindowUsage`.
6. **Indexes.** `ai_requests` gets a composite index on
   `(user_id, created_at)` — already exists (`ai_requests_user_idx`) — the
   window queries are cheap.
7. **Kill switch.** A `token_metering_enabled` app setting to flip between
   credit and token enforcement during rollout, so a bad limit never bricks
   paying users.

## Open decisions before building

- Daily-reward shape in a token world (bonus tokens vs streak cosmetic).
- Whether admin users bypass limits (recommended: yes, like today).
- Grace behavior at the boundary: a run that *starts* under the limit may
  finish over it (soft overshoot, recommended) vs hard mid-run abort.
