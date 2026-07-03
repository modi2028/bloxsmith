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

export type ProviderId = "anthropic" | "google" | "openai";

/**
 * Fetch and decrypt a provider API key at the moment of use. The plaintext
 * must never be logged, stored, or returned to any client.
 */
export async function getProviderApiKey(
  provider: ProviderId,
): Promise<string> {
  const row = await db.query.providerKeys.findFirst({
    where: eq(schema.providerKeys.provider, provider),
  });
  if (!row) throw new NoProviderKeyError(provider);
  return decryptSecret(row.encryptedKey);
}
