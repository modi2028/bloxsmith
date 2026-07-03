import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * AES-256-GCM envelope encryption for secrets at rest (provider API keys,
 * TOTP secrets). Pure functions — the key is passed in explicitly so this
 * module is testable outside Next.js; `crypto/index.ts` binds it to the
 * MASTER_ENCRYPTION_KEY from the environment.
 *
 * Wire format: "v1.<iv>.<authTag>.<ciphertext>" (each part base64).
 */

const VERSION = "v1";
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM

export function encryptSecret(plaintext: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(envelope: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognized secret envelope format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Last four characters of a secret, for masked admin display. */
export function last4(secret: string): string {
  return secret.slice(-4);
}

/**
 * SHA-256 hash for opaque bearer tokens (sessions, plugin tokens, redemption
 * codes). Tokens are high-entropy random strings, so a fast unsalted hash is
 * appropriate — this is not password hashing.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokensEqual(hashA: string, hashB: string): boolean {
  const a = Buffer.from(hashA, "hex");
  const b = Buffer.from(hashB, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** URL-safe random token, e.g. for session cookies and plugin tokens. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Short human-typable pairing code, e.g. "7KQ2-M9XF" (no 0/O/1/I). */
export function generatePairingCode(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const raw = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[raw[i] % alphabet.length];
    if (i === 3) code += "-";
  }
  return code;
}
