// Discriminated unions mirroring docs/SPEC.md §5 (envelopes) and §6 (user-level message table).

export type PeerRole = "host" | "guest";

export type RelayMessageType =
  | "heartbeat"
  | "heartbeat-ack"
  | "peer-joined"
  | "peer-left"
  | "session-expired";

interface RelayEnvelopeBase<Type extends RelayMessageType, Data> {
  level: "relay";
  type: Type;
  session_id: string;
  timestamp: string;
  data: Data;
}

export type RelayMessage =
  | RelayEnvelopeBase<"heartbeat", Record<string, never>>
  | RelayEnvelopeBase<"heartbeat-ack", Record<string, never>>
  | RelayEnvelopeBase<"peer-joined", { role: PeerRole }>
  | RelayEnvelopeBase<"peer-left", { role: PeerRole }>
  | RelayEnvelopeBase<"session-expired", { reason: "idle" | "join-timeout" | "heartbeat-timeout" }>;

/** The unencrypted outer wrapper for a user-level message — relay only ever sees this shape. */
export interface UserEnvelope {
  level: "user";
  session_id: string;
  timestamp: string;
  nonce: string;
  ciphertext: string;
}

export type UserMessageType =
  | "join-request"
  | "join-accept"
  | "join-reject"
  | "terminal-data"
  | "terminal-resize"
  | "keystroke"
  | "control-request"
  | "control-grant"
  | "control-revoke"
  | "chat-message"
  | "session-end";

interface UserMessageBase<Type extends UserMessageType, Payload> {
  type: Type;
  payload: Payload;
}

/** The plaintext shape produced after decrypting a {@link UserEnvelope}'s ciphertext. */
export type UserMessage =
  | UserMessageBase<"join-request", { client_version: string }>
  | UserMessageBase<"join-accept", { cols: number; rows: number }>
  | UserMessageBase<"join-reject", { reason?: "declined" | "invalid-passphrase" }>
  | UserMessageBase<"terminal-data", { chunk: string }>
  | UserMessageBase<"terminal-resize", { cols: number; rows: number }>
  | UserMessageBase<"keystroke", { data: string }>
  | UserMessageBase<"control-request", Record<string, never>>
  | UserMessageBase<"control-grant", Record<string, never>>
  | UserMessageBase<"control-revoke", Record<string, never>>
  | UserMessageBase<"chat-message", { text: string; from: PeerRole }>
  | UserMessageBase<"session-end", { reason?: "user-quit" | "peer-disconnected" | "idle-timeout" }>;
