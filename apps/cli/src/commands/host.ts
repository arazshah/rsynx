import * as readline from "node:readline/promises";
import {
  DecryptionError,
  decryptMessage,
  deriveSessionKey,
  encryptMessage,
  generatePassphrase,
  generateSessionId,
  type EncryptedEnvelope,
  type UserMessage,
} from "@rsynx/protocol";
import { RelayClient } from "../relay-client";

const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

function isJoinRequest(message: unknown): message is Extract<UserMessage, { type: "join-request" }> {
  return typeof message === "object" && message !== null && (message as { type?: unknown }).type === "join-request";
}

export async function runHost(): Promise<void> {
  const sessionId = generateSessionId();
  const passphrase = generatePassphrase();

  console.log();
  console.log(`  ${BOLD}${CYAN}rsynx host${RESET}`);
  console.log("  ───────────────────────────────");
  console.log(`  Session code:  ${BOLD}${GREEN}${sessionId}${RESET}`);
  console.log(`  Passphrase:    ${BOLD}${GREEN}${passphrase}${RESET}`);
  console.log("  ───────────────────────────────");
  console.log("  Share both values with your guest out of band (voice, chat, ...).");
  console.log();

  const key = await deriveSessionKey(sessionId, passphrase);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  await new Promise<void>((resolve, reject) => {
    const client = new RelayClient(sessionId, "host", {
      onPeerJoined: (role) => {
        console.log(`  Guest connected (role: ${role}).`);
      },
      onPeerLeft: () => {
        console.log("  Guest disconnected.");
      },
      onUserEnvelope: async (envelope) => {
        let message: unknown;
        try {
          message = await decryptMessage(key, envelope as unknown as EncryptedEnvelope);
        } catch (error) {
          if (error instanceof DecryptionError) {
            // Wrong passphrase or corrupted message — ignore silently (docs/SPEC.md §2 step 12).
            return;
          }
          throw error;
        }

        if (!isJoinRequest(message)) return;

        const answer = (await rl.question("  Guest wants to join. Accept? [Y/n] ")).trim().toLowerCase();
        const accepted = answer === "" || answer === "y";

        const reply: UserMessage = accepted
          ? { type: "join-accept", payload: { cols: process.stdout.columns ?? 80, rows: process.stdout.rows ?? 24 } }
          : { type: "join-reject", payload: { reason: "declined" } };

        const replyEnvelope = await encryptMessage(key, reply);
        client.sendUserEnvelope({
          level: "user",
          session_id: sessionId,
          timestamp: new Date().toISOString(),
          ...replyEnvelope,
        });

        console.log(accepted ? "  Accepted. (terminal streaming not implemented yet)" : "  Rejected.");
      },
      onSessionExpired: (reason) => {
        console.log(`  Session expired: ${reason}`);
        rl.close();
        client.close();
        resolve();
      },
      onClose: () => {
        rl.close();
        resolve();
      },
    });

    client
      .waitUntilOpen()
      .then(() => console.log("  Connected to relay. Waiting for a guest to join..."))
      .catch(reject);
  });
}
