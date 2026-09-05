import { describe, expect, test } from "bun:test";
import { deriveSessionKey } from "./key-derivation";
import { decryptMessage, DecryptionError, encryptMessage } from "./message-crypto";

describe("encryptMessage / decryptMessage", () => {
  test("round-trips an arbitrary JSON-serializable message", async () => {
    const key = await deriveSessionKey("482913", "7X4K");
    const original = { type: "chat-message", payload: { text: "hello", from: "host" } };

    const envelope = await encryptMessage(key, original);
    const decrypted = await decryptMessage(key, envelope);

    expect(decrypted).toEqual(original);
  });

  test("uses a fresh nonce for every message", async () => {
    const key = await deriveSessionKey("482913", "7X4K");
    const a = await encryptMessage(key, { type: "heartbeat" });
    const b = await encryptMessage(key, { type: "heartbeat" });

    expect(a.nonce).not.toBe(b.nonce);
  });

  test("throws a DecryptionError (not a crash) when the key is wrong", async () => {
    const key = await deriveSessionKey("482913", "7X4K");
    const wrongKey = await deriveSessionKey("482913", "9ZZZ");
    const envelope = await encryptMessage(key, { type: "chat-message", payload: { text: "hi" } });

    await expect(decryptMessage(wrongKey, envelope)).rejects.toBeInstanceOf(DecryptionError);
  });

  test("throws a DecryptionError when the ciphertext is tampered with", async () => {
    const key = await deriveSessionKey("482913", "7X4K");
    const envelope = await encryptMessage(key, { type: "chat-message", payload: { text: "hi" } });
    const tampered = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) + "abcd" };

    await expect(decryptMessage(key, tampered)).rejects.toBeInstanceOf(DecryptionError);
  });
});
