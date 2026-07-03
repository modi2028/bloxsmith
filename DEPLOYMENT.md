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
