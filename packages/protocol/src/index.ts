export { generatePassphrase, generateSessionId, PASSPHRASE_ALPHABET } from "./ids";
export { deriveKeyBytes, deriveSessionKey } from "./key-derivation";
export { decryptMessage, DecryptionError, encryptMessage, type EncryptedEnvelope } from "./message-crypto";
export type {
  PeerRole,
  RelayMessage,
  RelayMessageType,
  UserEnvelope,
  UserMessage,
  UserMessageType,
} from "./messages";
