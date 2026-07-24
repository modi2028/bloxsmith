/**
 * List the models the connected ChatGPT account can actually reach through
 * the local openai-oauth proxy.
 *
 * Which models are available is NOT fixed — it depends on the ChatGPT plan
 * behind the OAuth session and changes over time, so this asks rather than
 * assumes. Put the one you want in CHATGPT_OAUTH_MODEL; no catalog change or
 * migration is needed, since our catalog id ("chatgpt") is decoupled from the
 * upstream model id.
 *
 *   npx openai-oauth@latest --detach   # proxy must be running
 *   npm run chatgpt:models
 */
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: [".env.local", ".env"] });

const BASE = process.env.CHATGPT_OAUTH_BASE ?? "http://127.0.0.1:10531/v1";
const CURRENT = process.env.CHATGPT_OAUTH_MODEL ?? "gpt-5.5";

async function main() {
  let res: Response;
  try {
    res = await fetch(`${BASE}/models`, {
      headers: { Authorization: "Bearer oauth" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error(`Could not reach the openai-oauth proxy at ${BASE}`);
    console.error(`  ${(err as Error).message}`);
    console.error("\nStart it with:");
    console.error("  npx openai-oauth@latest login");
    console.error("  npx openai-oauth@latest --detach");
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`Proxy returned ${res.status} ${res.statusText}`);
    if (res.status === 401 || res.status === 403) {
      console.error("The OAuth session looks expired — run:");
      console.error("  npx openai-oauth@latest login");
    }
    process.exit(1);
  }

  const body = (await res.json()) as { data?: { id?: string }[] };
  const ids = (body.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => !!id)
    .sort();

  if (ids.length === 0) {
    console.log("The proxy reported no models for this account.");
    return;
  }

  console.log(`Models available to this ChatGPT account (${ids.length}):\n`);
  for (const id of ids) {
    console.log(`  ${id}${id === CURRENT ? "   <- CHATGPT_OAUTH_MODEL" : ""}`);
  }
  if (!ids.includes(CURRENT)) {
    console.log(
      `\nWARNING: CHATGPT_OAUTH_MODEL is "${CURRENT}", which is NOT in the list above.`,
    );
    console.log("Every ChatGPT request will fail until it is changed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
