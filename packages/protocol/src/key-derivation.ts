import { scryptSync } from "node:crypto";

/**
 * scrypt is not exposed by the standard Web Crypto (SubtleCrypto) API, so this
 * uses node:crypto's built-in scryptSync (bundled with Bun, no external
 * package) as the one deliberate exception noted in docs/SPEC.md §3 — every
 * other cryptographic operation in this package uses Web Crypto.
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH_BYTES = 32;

const SESSION_ID_PATTERN = /^\d{6}$/;

function assertValidInputs(sessionId: string, passphrase: string): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error(`Invalid session-id: expected 6 digits, got "${sessionId}"`);
  }
  if (passphrase.length !== 4) {
    throw new Error(`Invalid passphrase: expected 4 characters, got length ${passphrase.length}`);
  }
}

/** Pure, synchronous key derivation — see docs/SPEC.md §3 for the exact algorithm. */
export function deriveKeyBytes(sessionId: string, passphrase: string): Uint8Array<ArrayBuffer> {
  assertValidInputs(sessionId, passphrase);
  const salt = `rsynx-v1:${sessionId}`;
  const derived = scryptSync(passphrase, salt, KEY_LENGTH_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return Uint8Array.from(derived);
}

/** Derives the raw key bytes and imports them as a non-extractable AES-256-GCM key. */
export async function deriveSessionKey(sessionId: string, passphrase: string): Promise<CryptoKey> {
  const keyBytes = deriveKeyBytes(sessionId, passphrase);
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
