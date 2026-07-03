import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  decryptSecret,
  encryptSecret,
  generatePairingCode,
  generateToken,
  hashToken,
  last4,
  tokensEqual,
} from "./aes";

const key = randomBytes(32);

describe("AES-256-GCM secret envelope", () => {
  it("round-trips a secret", () => {
    const secret = "sk-ant-api03-abc123-example";
    const envelope = encryptSecret(secret, key);
    assert.equal(decryptSecret(envelope, key), secret);
  });

  it("produces a distinct ciphertext per call (fresh IV)", () => {
    const a = encryptSecret("same-input", key);
    const b = encryptSecret("same-input", key);
    assert.notEqual(a, b);
  });

  it("does not contain the plaintext", () => {
    const envelope = encryptSecret("super-secret-value", key);
    assert.ok(!envelope.includes("super-secret-value"));
  });

  it("rejects tampered ciphertext (GCM auth)", () => {
    const envelope = encryptSecret("payload", key);
    const parts = envelope.split(".");
    const data = Buffer.from(parts[3], "base64");
    data[0] ^= 0xff;
    parts[3] = data.toString("base64");
    assert.throws(() => decryptSecret(parts.join("."), key));
  });

  it("rejects the wrong key", () => {
    const envelope = encryptSecret("payload", key);
    assert.throws(() => decryptSecret(envelope, randomBytes(32)));
  });

  it("rejects non-32-byte keys", () => {
    assert.throws(() => encryptSecret("x", randomBytes(16)));
  });

  it("handles unicode and long values", () => {
    const secret = "🔑".repeat(500) + "ø-key";
    assert.equal(decryptSecret(encryptSecret(secret, key), key), secret);
  });
});

describe("token helpers", () => {
  it("hashToken is deterministic and hex", () => {
    assert.equal(hashToken("abc"), hashToken("abc"));
    assert.match(hashToken("abc"), /^[0-9a-f]{64}$/);
  });

  it("tokensEqual compares hashes safely", () => {
    const h = hashToken(generateToken());
    assert.ok(tokensEqual(h, h));
    assert.ok(!tokensEqual(h, hashToken("other")));
  });

  it("generateToken is URL-safe and unique", () => {
    const t = generateToken();
    assert.match(t, /^[A-Za-z0-9_-]+$/);
    assert.notEqual(t, generateToken());
  });

  it("pairing code has the XXXX-XXXX shape without ambiguous chars", () => {
    for (let i = 0; i < 50; i++) {
      assert.match(generatePairingCode(), /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    }
  });

  it("last4 masks correctly", () => {
    assert.equal(last4("sk-ant-1234abcd"), "abcd");
  });
});
