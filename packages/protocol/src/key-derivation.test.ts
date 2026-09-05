import { describe, expect, test } from "bun:test";
import { deriveKeyBytes, deriveSessionKey } from "./key-derivation";

describe("deriveKeyBytes", () => {
  test("is deterministic for the same session-id and passphrase", () => {
    const a = deriveKeyBytes("482913", "7X4K");
    const b = deriveKeyBytes("482913", "7X4K");
    expect(a).toEqual(b);
  });

  test("produces a 32-byte key", () => {
    const key = deriveKeyBytes("482913", "7X4K");
    expect(key).toHaveLength(32);
  });

  test("differs when the session-id differs", () => {
    const a = deriveKeyBytes("482913", "7X4K");
    const b = deriveKeyBytes("111111", "7X4K");
    expect(a).not.toEqual(b);
  });

  test("differs when the passphrase differs", () => {
    const a = deriveKeyBytes("482913", "7X4K");
    const b = deriveKeyBytes("482913", "9ZZZ");
    expect(a).not.toEqual(b);
  });

  test("rejects a session-id that is not 6 digits", () => {
    expect(() => deriveKeyBytes("123", "7X4K")).toThrow();
    expect(() => deriveKeyBytes("12345a", "7X4K")).toThrow();
  });

  test("rejects a passphrase that is not 4 characters", () => {
    expect(() => deriveKeyBytes("482913", "ABC")).toThrow();
  });
});

describe("deriveSessionKey", () => {
  test("returns a usable AES-GCM CryptoKey", async () => {
    const key = await deriveSessionKey("482913", "7X4K");
    expect(key.algorithm.name).toBe("AES-GCM");
    expect(key.usages).toContain("encrypt");
    expect(key.usages).toContain("decrypt");
  });
});
