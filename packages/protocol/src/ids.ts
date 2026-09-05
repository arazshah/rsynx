/**
 * Excludes visually ambiguous characters (0/O, 1/I) so a session-id or
 * passphrase read aloud or over chat isn't misheard/mistyped (see docs/SPEC.md §3.4).
 */
export const PASSPHRASE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * Uniform rejection-sampled index in [0, max). Avoids the modulo bias a plain
 * `byte % max` would introduce when 256 isn't a multiple of max.
 */
function secureRandomIndex(max: number): number {
  const limit = 256 - (256 % max);
  let byte: number;
  do {
    byte = crypto.getRandomValues(new Uint8Array(1))[0]!;
  } while (byte >= limit);
  return byte % max;
}

export function generateSessionId(): string {
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += secureRandomIndex(10).toString();
  }
  return id;
}

export function generatePassphrase(): string {
  let passphrase = "";
  for (let i = 0; i < 4; i++) {
    passphrase += PASSPHRASE_ALPHABET[secureRandomIndex(PASSPHRASE_ALPHABET.length)];
  }
  return passphrase;
}
