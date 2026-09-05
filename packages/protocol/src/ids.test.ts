import { describe, expect, test } from "bun:test";
import { generatePassphrase, generateSessionId, PASSPHRASE_ALPHABET } from "./ids";

describe("generateSessionId", () => {
  test("produces a 6-digit numeric string", () => {
    for (let i = 0; i < 200; i++) {
      const id = generateSessionId();
      expect(id).toMatch(/^\d{6}$/);
    }
  });

  test("produces varied values", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateSessionId()));
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe("generatePassphrase", () => {
  test("produces a 4-character string from the readable alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const passphrase = generatePassphrase();
      expect(passphrase).toHaveLength(4);
      for (const char of passphrase) {
        expect(PASSPHRASE_ALPHABET).toContain(char);
      }
    }
  });

  test("never contains visually ambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      const passphrase = generatePassphrase();
      expect(passphrase).not.toMatch(/[0O1I]/);
    }
  });

  test("produces varied values", () => {
    const passphrases = new Set(Array.from({ length: 50 }, () => generatePassphrase()));
    expect(passphrases.size).toBeGreaterThan(1);
  });
});
