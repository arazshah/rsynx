const NONCE_LENGTH_BYTES = 12;

export interface EncryptedEnvelope {
  nonce: string; // base64
  ciphertext: string; // base64, ciphertext‖tag as produced by AES-GCM
}

/** Thrown whenever decryption fails (wrong key or tampered ciphertext) — never a raw crash. */
export class DecryptionError extends Error {
  constructor(cause: unknown) {
    super("Failed to decrypt message: invalid key or corrupted ciphertext");
    this.name = "DecryptionError";
    this.cause = cause;
  }
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

/** Encrypts an arbitrary JSON-serializable message with a fresh random nonce (docs/SPEC.md §4). */
export async function encryptMessage(key: CryptoKey, message: unknown): Promise<EncryptedEnvelope> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(message));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext);
  return {
    nonce: toBase64(nonce),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Decrypts a message; rejects with {@link DecryptionError} on any failure, never throws/crashes raw. */
export async function decryptMessage(key: CryptoKey, envelope: EncryptedEnvelope): Promise<unknown> {
  try {
    const nonce = fromBase64(envelope.nonce);
    const ciphertext = fromBase64(envelope.ciphertext);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch (error) {
    throw new DecryptionError(error);
  }
}
