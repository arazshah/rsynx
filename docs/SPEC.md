# rsynx Protocol Specification

Protocol version: `1`. This document is the sole source of truth for protocol
behavior — the implementations in packages/protocol, apps/relay, and apps/cli must
follow it exactly, and any behavioral change must be updated here first.

## 1. Roles and responsibilities

### 1.1 Host

- Starts the session by running `rsynx host`.
- Generates the session-id (six digits) and passphrase (four characters) locally and
  randomly, and displays them — these two values are never generated or seen by the
  relay in their original, unencrypted form (only the session-id is sent to the relay
  for routing; the passphrase never crosses the network).
- Derives the shared encryption key from session-id + passphrase.
- Is the only party that can approve or reject a join-request.
- Is, by default, the only one typing into the terminal; it is the only party that can
  grant the guest typing control or revoke it at any moment.
- Encrypts its own local terminal output stream and streams it as `terminal-data`.

### 1.2 Guest

- Connects to the session with `rsynx join <session-id>` and prompts the user for the
  passphrase.
- Derives the shared key from that same session-id + passphrase (as typed by the
  user) — this key is never sent to the relay or the host; it is only used for local
  encryption/decryption.
- Sends an encrypted `join-request` and waits for `join-accept` or `join-reject`.
- Once approved, receives and renders the `terminal-data` stream, can send
  `chat-message`, and can send `control-request` to take typing control (subject to
  host approval).

### 1.3 Relay

- Only forwards messages between the two parties based on session-id.
- Never has the decryption key and never attempts to decrypt user payloads.
- Keeps sessions only in memory (in-memory), never on disk.
- Is responsible for enforcing the three timeout types (section 7) and closing
  expired sessions.
- Generates and consumes relay-level messages (heartbeat, peer-joined, peer-left,
  session-expired) itself; these are never encrypted since they are only connection
  metadata, not session content.

## 2. Full lifecycle of a session

1. The Host user runs `rsynx host`.
2. The CLI generates a random six-digit session-id and four-character passphrase
   (section 3.4) and displays them in the terminal.
3. The CLI derives the shared encryption key from session-id + passphrase (section 3)
   and keeps it only in process memory.
4. The CLI opens a WebSocket connection to the relay and sends a relay-level
   connection message with the session-id and role=`host` (the relay registers this
   session in memory).
5. The Host waits for a `peer-joined` message (up to the join-wait-timeout deadline,
   section 7.2).
6. The Guest user runs `rsynx join <session-id>` and enters the passphrase.
7. The Guest CLI derives the shared key from that same session-id + passphrase.
8. The Guest CLI connects to the relay and sends the same session-id with
   role=`guest`.
9. Once the relay sees both roles (host and guest) active for a session-id, it sends
   `peer-joined` to both sides.
10. Immediately after receiving `peer-joined`, the Guest sends an encrypted
    `join-request` user-level message.
11. The relay forwards this encrypted message to the Host based on session-id alone,
    without opening it.
12. The Host decrypts the message with the shared key:
    - If decryption succeeds (i.e. the passphrase was correct), it prompts the Host
      user with a Y/n prompt in the terminal.
    - If decryption fails (wrong key), the Host silently ignores the message or, at
      most, sends a generic `join-reject` — it must never crash or leak details of the
      cryptographic error.
13. If the Host answers "Y": it sends an encrypted `join-accept`. If it answers "n" or
    the approval window expires: it sends an encrypted `join-reject` and the session is
    closed on the Host side for that guest.
14. After receiving `join-accept`, the Guest enters TUI display mode.
15. The Host begins streaming its local terminal output as encrypted `terminal-data`
    messages; from this point on, both sides also start periodic heartbeats
    (section 7.3).

From this point, the session is active, and `chat-message`, `control-request`, and
similar messages are exchanged per sections 5 and 6 until `session-end`.

## 3. Shared key derivation

- Inputs: `session_id` (a 6-digit numeric string, e.g. `"482913"`) and `passphrase` (a
  4-character string from the alphabet in section 3.4).
- Algorithm: **scrypt** with parameters:
  - `N = 16384` (2¹⁴)
  - `r = 8`
  - `p = 1`
  - `dkLen = 32` bytes (for an AES-256 key)
- scrypt `password` input = `passphrase` (UTF-8).
- scrypt `salt` input = `"rsynx-v1:" + session_id` (UTF-8) — a fixed prefix plus the
  session-id, so derived keys differ across session-ids even with the same
  passphrase.
- Output: a 32-byte key, used directly as the AES-256-GCM key.
- **This key never crosses the network.** Both the Host and the Guest compute it
  independently and locally from the two values exchanged between them over an
  out-of-band channel (voice, chat, messenger). The session-id alone (without the
  passphrase) is sent to the relay, since the relay only needs it for routing and it
  is not considered a secret value.

### 3.4 Generating the session-id and passphrase

- `session_id`: 6 random digits from `0-9` (a numeric string, may start with a zero).
- `passphrase`: 4 random characters from a readable alphabet (excluding
  similar-looking letters/digits): `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` — i.e. excluding
  `0`, `O`, `1`, `I` — so it isn't misread when read aloud or over text chat.
- Both values must be generated with a cryptographically secure random source
  (CSPRNG), not `Math.random`.

## 4. Message encryption

- Algorithm: **AES-256-GCM**.
- For every user-level message, a random 12-byte nonce (96 bits, the GCM standard
  size) is generated with a CSPRNG — a nonce is never reused across two different
  messages.
- The output of AES-GCM encryption consists of ciphertext + auth tag (16 bytes,
  appended to the end of the ciphertext by the Web Crypto API).
- Wire format: `nonce` and `ciphertext‖tag` are each base64-encoded separately and
  placed in separate fields of the JSON envelope (section 5.2).
- The decrypted content of every user-level message is itself a UTF-8 JSON object
  shaped like:
  ```json
  { "type": "<message-type>", "payload": { /* section 6 */ } }
  ```
- **Decryption with the wrong key must always return a handleable error (a catchable
  exception), never crash.** The receiving side must handle this error as either
  "ignore the message" or "generic join-reject" (section 2, step 12).

## 5. Envelope format

There are two wire-level envelope types; both are a JSON object inside a WebSocket
text frame.

### 5.1 Relay-level envelope (unencrypted)

```json
{
  "level": "relay",
  "type": "heartbeat",
  "session_id": "482913",
  "timestamp": "2026-09-05T12:34:56.789Z",
  "data": {}
}
```

Fields:

| Field | Type | Description |
|---|---|---|
| `level` | `"relay"` | constant |
| `type` | string | one of the types in table 5.3 |
| `session_id` | string | 6-digit session identifier |
| `timestamp` | string | ISO 8601 UTC (`Z`) |
| `data` | object | per-message-type metadata; may be empty |

### 5.2 User-level envelope (encrypted)

```json
{
  "level": "user",
  "session_id": "482913",
  "timestamp": "2026-09-05T12:34:56.789Z",
  "nonce": "base64==",
  "ciphertext": "base64=="
}
```

Fields:

| Field | Type | Description |
|---|---|---|
| `level` | `"user"` | constant |
| `session_id` | string | for routing by the relay; unencrypted |
| `timestamp` | string | ISO 8601 UTC, send time (not receive time) |
| `nonce` | string | base64 of the 12-byte AES-GCM nonce |
| `ciphertext` | string | base64 of ciphertext‖tag; the relay never opens it |

### 5.3 Relay-level message table

| type | direction | meaning | `data` |
|---|---|---|---|
| `heartbeat` | client → relay | client is alive | `{}` |
| `heartbeat-ack` | relay → client | heartbeat receipt acknowledged | `{}` |
| `peer-joined` | relay → both sides | both roles for this session-id are now connected | `{ "role": "host" \| "guest" }` (the role of the peer that just connected) |
| `peer-left` | relay → remaining side | the peer disconnected | `{ "role": "host" \| "guest" }` |
| `session-expired` | relay → client(s) | one of the three timeouts in section 7 was reached | `{ "reason": "idle" \| "join-timeout" \| "heartbeat-timeout" }` |

## 6. User-level message table (encrypted)

Each row shows the exact structure of the `payload` inside the `{ "type": ...,
"payload": ... }` envelope (after decryption, section 4).

| type | direction | `payload` |
|---|---|---|
| `join-request` | Guest → Host | `{ "client_version": "1.0.0" }` |
| `join-accept` | Host → Guest | `{ "cols": 120, "rows": 32 }` (the host terminal's current dimensions) |
| `join-reject` | Host → Guest | `{ "reason"?: "declined" \| "invalid-passphrase" }` (the `reason` field is optional; for an invalid key it must be generic and non-revealing) |
| `terminal-data` | Host → Guest | `{ "chunk": "base64-raw-bytes" }` (a raw chunk of the terminal's stdout/stderr) |
| `terminal-resize` | Host → Guest | `{ "cols": 120, "rows": 32 }` (sent whenever the host terminal's size changes) |
| `keystroke` | Guest → Host | `{ "data": "base64-raw-bytes" }` (only while the Guest holds control; otherwise the Host must ignore it) |
| `control-request` | Guest → Host | `{}` |
| `control-grant` | Host → Guest | `{}` |
| `control-revoke` | Host → Guest | `{}` (sent both in response to a revocation and spontaneously via the Host's shortcut key) |
| `chat-message` | either side | `{ "text": "string", "from": "host" \| "guest" }` |
| `session-end` | either side | `{ "reason"?: "user-quit" \| "peer-disconnected" \| "idle-timeout" }` |

## 7. Terminal control rules

- By default only the Host types; `keystroke` messages from the Guest must be ignored
  (not executed) by the Host until control has been granted.
- The Guest must send `control-request` to take control.
- The Host responds via a Y/n prompt in the TUI; on approval it sends `control-grant`,
  otherwise nothing is sent (the request goes unanswered unless the Host dismisses the
  prompt again).
- After `control-grant`, `keystroke` messages from the Guest are written by the Host
  to the local pty.
- At any moment, even mid-way through Guest control, the Host can immediately send
  `control-revoke` via a dedicated shortcut key (default: `Ctrl+G`) and stop writing
  the Guest's keystrokes to the pty — this operation must not wait for any
  acknowledgment or response from the Guest.

## 8. The three timeout types

| Type | Value | Behavior |
|---|---|---|
| session idle timeout | 30 minutes with no user-level message (`terminal-data`, `keystroke`, `chat-message`, ...) | the relay sends `session-expired` with `reason: "idle"` and removes the session from memory |
| join-wait timeout | 10 minutes from the moment the Host connects, if the Guest never connects (i.e. `peer-joined` never occurs) | the relay sends the Host `session-expired` with `reason: "join-timeout"` and closes the session |
| heartbeat timeout | 45 seconds with no `heartbeat` received from one side | the relay considers that side disconnected, sends `peer-left` to the other side, and closes the session if no side remains |

Each client must send a `heartbeat` every 15–20 seconds so it doesn't simply skirt the
45-second deadline.

## 9. What the relay must never do

- **Never** store user-level payloads (encrypted or in any other representation) on
  disk — sessions are kept only in an in-memory Map on the process.
- **Never** attempt to decrypt `ciphertext`, and never hold a key that could do so.
- **Never** keep a session alive after it ends (`session-end` or any of the three
  timeout types) — it must be removed from memory immediately.
- **Never** log payload content (encrypted or decrypted) — logs contain only the
  session-id, the message type (the relay-level `type`, or simply "a user-level
  message arrived" without details for encrypted messages), and the timestamp.
