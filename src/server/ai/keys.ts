import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { decryptSecret } from "@/server/crypto";

export class NoProviderKeyError extends Error {
  constructor(public readonly provider: string) {
    super(
      `No ${provider} API key is configured. Set one with: npm run key:set -- ${provider} <key>`,
    );
  }
}

export type ProviderId =
  | "anthropic"
  | "google"
  | "openai"
  | "zai"
  | "chatgpt";

/**
 * Fetch and decrypt a provider API key at the moment of use. The plaintext
 * must never be logged, stored, or returned to any client.
 */
export async function getProviderApiKey(
  provider: ProviderId,
): Promise<string> {
  // ChatGPT holds no API key of ours — the local openai-oauth proxy carries
  // the Codex OAuth session and ignores the Authorization header. A
  // placeholder keeps the shared OpenAI client happy (it refuses an empty
  // apiKey) without implying a secret exists.
  if (provider === "chatgpt") return "oauth";

  const row = await db.query.providerKeys.findFirst({
    where: eq(schema.providerKeys.provider, provider),
  });
  if (!row) throw new NoProviderKeyError(provider);
  return decryptSecret(row.encryptedKey);
}
