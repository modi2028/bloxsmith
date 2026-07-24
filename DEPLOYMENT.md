# Going live with Bloxsmith

Three things to publish: the **website** (host it), the **Studio plugin**
(publish to Roblox), and a way to **post updates** (redeploy). This guide uses
Railway for hosting because it's the simplest always-on Node host and
auto-deploys when you push to GitHub.

> Why not Vercel: a build request can hold the connection open for minutes
> while the AI works. That needs a long-running Node server (Railway/Render/
> Fly/VPS), not short-lived serverless functions.

---

## 0. Prerequisites

- A GitHub account.
- Your Supabase project (already set up — you'll reuse it in production).
- Your Roblox OAuth app (already created).
- A Stripe account (for live payments).
- Optional: a custom domain (e.g. from Namecheap/Cloudflare). You can launch on
  the free Railway subdomain first and add a domain later.

---

## 1. Put the code on GitHub

The project is a git repo already; it just needs a remote.

```powershell
cd c:\Users\birk\roblox-ai-builder
git add -A
git commit -m "Prepare for deploy"
```

Then on github.com: **New repository** → name it `bloxsmith` → **Private** →
Create. Copy the commands GitHub shows under "…or push an existing repository",
which look like:

```powershell
git remote add origin https://github.com/<you>/bloxsmith.git
git branch -M main
git push -u origin main
```

`.env.local` is gitignored, so your secrets are NOT pushed. Good.

---

## 2. Deploy on Railway

1. Go to [railway.app](https://railway.app) → sign in with GitHub.
2. **New Project → Deploy from GitHub repo →** pick `bloxsmith`.
3. Railway auto-detects Next.js, runs `npm run build`, and starts it with
   `npm run start`. First build takes a few minutes.
4. It will fail to boot until you add environment variables — that's next.

### Environment variables (Railway → your service → Variables)

Add every line from your local `.env.local`, with these production changes:

| Variable | Production value |
| --- | --- |
| `APP_URL` | Your live URL (e.g. `https://bloxsmith.up.railway.app`, or your custom domain). **No trailing slash.** |
| `DATABASE_URL` | Same Supabase **transaction pooler** string you use locally |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Same as local |
| `MASTER_ENCRYPTION_KEY` / `SESSION_SECRET` | **Same values as local** — if these change, existing encrypted keys and sessions break |
| `ROBLOX_CLIENT_ID` / `ROBLOX_CLIENT_SECRET` | Same as local |
| `ADMIN_ROBLOX_USER_IDS` | Your Roblox id |
| `STRIPE_SECRET_KEY` | Your **live** key `sk_live_...` (see §5) |
| `STRIPE_WEBHOOK_SECRET` | The live webhook secret (see §5) |
| `NODE_ENV` | `production` |

After saving variables, Railway redeploys. Under **Settings → Networking**,
click **Generate Domain** to get a public URL. Put that URL in `APP_URL` (and
redeploy) unless you're using a custom domain.

> The database schema is already applied (you ran migrations against this
> Supabase project during development), so there's nothing to migrate. If you
> ever add schema changes, run `npm run db:migrate` locally against the same
> `DATABASE_URL`.

---

## 3. Custom domain (optional)

Railway → Settings → Networking → **Custom Domain** → enter e.g.
`bloxsmith.app`. Railway shows a CNAME record; add it at your domain registrar.
Once it verifies, set `APP_URL=https://bloxsmith.app` and redeploy.

---

## 4. Roblox OAuth for production

1. [create.roblox.com/dashboard/credentials](https://create.roblox.com/dashboard/credentials)
   → your Bloxsmith app.
2. **Redirect URLs:** add `https://<your-domain>/api/auth/roblox/callback`
   (keep the localhost one for dev).
3. **Lift the 10-user cap:** your app is in private mode (max 10 users) until
   Roblox reviews it. Fill in the required fields (description, thumbnail,
   privacy policy URL = `https://<your-domain>/privacy`, terms URL =
   `https://<your-domain>/terms`) and **submit for review**. Approval unlocks
   public use. You can soft-launch to ≤10 testers immediately.

---

## 5. Stripe live mode

1. Toggle Stripe Dashboard to **Live mode**.
2. **Developers → API keys →** copy the live **Secret key** (`sk_live_...`) into
   Railway's `STRIPE_SECRET_KEY`.
3. Create the live products/prices by running the setup script **against the
   live key** (from your machine, temporarily set the live key in `.env.local`,
   or run it once with the live key in the environment):
   ```powershell
   npm run stripe:setup
   ```
4. **Developers → Webhooks → Add endpoint:**
   - URL: `https://<your-domain>/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `invoice.paid`,
     `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the endpoint's **Signing secret** (`whsec_...`) into Railway's
     `STRIPE_WEBHOOK_SECRET`, then redeploy.
5. Test a real purchase with a live card (you can refund yourself in Stripe).

---

## 6. Publish the Studio plugin

1. **Point the plugin at your domain.** In `plugin/bloxsmith.server.lua`, set:
   ```lua
   local BASE_URL_DEFAULT = "https://<your-domain>"
   ```
   Commit and push.
2. In Roblox Studio, open a place. In the **Explorer**, right-click and insert
   the script, or use the toolbar: get the plugin loaded (the local copy you
   installed reads from `%LOCALAPPDATA%\Roblox\Plugins`). To publish a clean
   copy: create a `Script` in ServerStorage, paste the plugin source, then
   right-click it → **Save as Local Plugin** to verify, and → **Publish as
   Plugin** (or **Save to Roblox**) to upload it to the Creator Store.
3. In the publish dialog set the name (**Bloxsmith**), description, and icon,
   and set it **Public**. Submit.
4. Once live on the Creator Store, users click **Install** and it appears in
   their Studio Plugins tab. Marketplace plugins **auto-update** — when you
   publish a new version, installed users get it automatically.

> Local plugins (dropped into the Plugins folder) get unrestricted HTTP with no
> prompt. Marketplace-installed plugins show a one-time per-domain HTTP
> permission prompt the first time they call your API — users click Allow once.

---

## 7. Posting updates

**Website:** just push to GitHub.

```powershell
git add -A
git commit -m "What changed"
git push
```

Railway auto-deploys every push to `main`. Watch the deploy in the Railway
dashboard; it goes live in a few minutes with zero downtime.

**Plugin:** edit `plugin/bloxsmith.server.lua`, then re-publish the plugin to
the Creator Store (same asset, "Update"/"Overwrite" existing). Installed users
auto-update.

**Model prices / packs:** edit `src/lib/model-catalog.ts`, then run
`npm run apply:catalog` against production `DATABASE_URL`.

---

## 8. The ChatGPT model, for everyone (openai-oauth)

The `chatgpt` model is powered by a ChatGPT subscription over the
[openai-oauth](https://github.com/EvanZhouDev/openai-oauth) proxy, not the
paid OpenAI API. The proxy is a **separate long-running process**, so serving
it site-wide means giving it its own Railway service on the private network.

Read the risk note in the README first. In short: the OAuth mechanism itself
is tolerated by OpenAI, but pooling one account across a hosted site is what
the project rules out, so treat this account as expendable and never make it
the default model.

### 8.1 One-time: create the session locally

The sign-in is an interactive browser flow, so it cannot happen inside a
headless container. Do it on your machine, then carry the result up:

```powershell
npx openai-oauth@latest login
```

That writes the session to `~/.codex/auth.json` (`$env:USERPROFILE\.codex\auth.json`
on Windows). Use a **dedicated ChatGPT account** — not your personal one —
because everything the site does will run through it. A Pro plan gives far
more headroom than Plus; every user shares its rate limit.

### 8.2 Add the proxy service on Railway

1. Railway → **the same project** as the app (private networking is
   per-project) → **New** → **GitHub Repo** → same repo. Railway will start
   an incorrect first build immediately; ignore it, step 3 fixes it.
2. Service → Settings → **Rename** to `openai-oauth`. Do this before step 6:
   the internal hostname comes from the service name.
3. Service → **Variables** → add `RAILWAY_DOCKERFILE_PATH` =
   `Dockerfile.openai-oauth`. It must be a *service variable*, not a root
   `railway.json` — a root config would apply to the app service too and
   break its build.
4. Settings → **Networking** → **Public Networking**: confirm there is **no
   domain**. If Railway generated one, delete it. (See the security note
   below — this matters more than anything else on this page.)
5. Settings → **Volumes**: add a volume mounted at `/data`. **Required, not
   optional** — the proxy rotates the session as it runs, and the entrypoint
   only seeds from the env var when no session file exists yet. Without the
   volume, every redeploy restores the stale bootstrap copy and the model
   dies once the original credentials age out.
6. Variables → set `CODEX_AUTH_JSON` to the **entire contents** of your local
   `~/.codex/auth.json`. Copy it without opening it:

   ```powershell
   Get-Content "$env:USERPROFILE\.codex\auth.json" -Raw | Set-Clipboard
   ```

   The entrypoint writes it to the volume on first boot and never overwrites
   it afterwards. Re-running `openai-oauth login` locally later may rotate
   the session and invalidate what production is holding — if the model
   starts failing after you log in again, re-seed (§8.6).

The service refuses to start with a clear log line if no session is present,
rather than coming up healthy and failing every request.

### 8.3 Point the app at it

On the **app** service (not the proxy), set:

| Variable              | Value                                                  |
| --------------------- | ------------------------------------------------------ |
| `CHATGPT_OAUTH_BASE`  | `http://<proxy-service-name>.railway.internal:10531/v1` |
| `CHATGPT_OAUTH_MODEL` | e.g. `gpt-5.5` — see below                              |

The proxy binds `0.0.0.0`. Do **not** "fix" this to the IPv6 wildcard `::`:
openai-oauth concatenates the host into its own upstream URL, so `::` yields
`http://:::10531` and every request returns 500 `Failed to parse URL`. The
IPv4 bind is verified reachable from the app service over
`openai-oauth.railway.internal`. Override with `PROXY_HOST` if ever needed.

Then confirm which models the account actually offers and set
`CHATGPT_OAUTH_MODEL` to one of them:

```sh
npm run chatgpt:models
```

Run it locally against the proxy, or with `CHATGPT_OAUTH_BASE` pointed at the
deployed one. It warns if the configured model isn't in the account's list —
worth checking after any plan change, since the list moves over time.

### 8.4 Never expose the proxy publicly

**The proxy endpoint requires no API key.** Anything that can reach it gets
unlimited ChatGPT billed to your account. A public domain on that service
turns it into an open proxy, which is both the fastest way to lose the
account and a bill you did not agree to. Keep it on the private network, and
if you ever port-forward it locally for debugging, bind `127.0.0.1`.

### 8.5 What users see when it breaks

If the proxy is down or the session expires, `chatgpt` requests fail with a
short "pick another model" notice and **every other model keeps working** —
the failure is contained to that one model. Because of this, `chatgpt` is
deliberately not the default and not `isDefault` in the catalog.

To take it offline entirely, set `enabled: false` on the `chatgpt` row in
`src/lib/model-catalog.ts` and run `npm run apply:catalog` — the model
disappears from the picker without a deploy of the app itself.

### 8.6 Replacing the session

If the session goes bad (revoked, expired, or you logged in again locally and
rotated it), updating `CODEX_AUTH_JSON` alone does **nothing** — the
entrypoint refuses to overwrite a session that already exists on the volume,
because on every ordinary redeploy that file is the good one.

To force it:

1. `npx openai-oauth@latest login` locally to get a fresh session.
2. Copy it: `Get-Content "$env:USERPROFILE\.codex\auth.json" -Raw | Set-Clipboard`
3. On the proxy service, set `CODEX_AUTH_JSON` to the new value **and** add
   `CODEX_AUTH_RESEED=1`.
4. Redeploy. The logs will show `CODEX_AUTH_RESEED=1 — replacing the stored
   session`.
5. **Remove `CODEX_AUTH_RESEED`.** Left in place, every future redeploy
   overwrites the rotated session with the bootstrap copy — the exact failure
   the volume exists to prevent.

---

## Launch checklist

- [ ] Code pushed to GitHub, Railway deploying green
- [ ] All env vars set on Railway; `APP_URL` matches the live URL
- [ ] Can sign in with Roblox on the live site
- [ ] Roblox OAuth redirect URL added; app submitted for review
- [ ] Stripe live keys + webhook set; test purchase credited correctly
- [ ] Plugin `BASE_URL_DEFAULT` = live domain; published to Creator Store
- [ ] Paired the published plugin and ran a real build end-to-end
- [ ] Provider API keys set in prod DB (`npm run key:set` runs against the
      same Supabase, so they're already there)

If you are shipping the ChatGPT model (§8):

- [ ] `npm run db:migrate` applied (adds `chatgpt` to the provider enum) and
      `npm run apply:catalog` run against production
- [ ] Proxy service deployed from `Dockerfile.openai-oauth`, with a volume at
      `/data` and `CODEX_AUTH_JSON` set
- [ ] Proxy service has **no public domain** — private networking only
- [ ] App service has `CHATGPT_OAUTH_BASE` + `CHATGPT_OAUTH_MODEL` set
- [ ] `npm run chatgpt:models` lists the configured model for that account
- [ ] Ran a real build on ChatGPT end-to-end, then stopped the proxy and
      confirmed other models still build fine
