import "server-only";
import { env } from "@/server/env";
import {
  decryptSecret as decryptWithKey,
  encryptSecret as encryptWithKey,
} from "./aes";

export {
  generatePairingCode,
  generateToken,
  hashToken,
  last4,
  tokensEqual,
} from "./aes";

const masterKey = Buffer.from(env.MASTER_ENCRYPTION_KEY, "base64");

/** Encrypt a secret (provider API key, TOTP secret) with the master key. */
export function encryptSecret(plaintext: string): string {
  return encryptWithKey(plaintext, masterKey);
}

/**
 * Decrypt a stored secret. Call only at the moment of use (e.g. right before
 * a provider API call) and never write the result to logs or responses.
 */
export function decryptSecret(envelope: string): string {
  return decryptWithKey(envelope, masterKey);
}
