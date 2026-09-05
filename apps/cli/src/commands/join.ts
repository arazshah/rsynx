import * as readline from "node:readline/promises";
import {
  DecryptionError,
  decryptMessage,
  deriveSessionKey,
  encryptMessage,
  type EncryptedEnvelope,
  type UserMessage,
} from "@rsynx/protocol";
import { RelayClient, type RelayClientEvents } from "../relay-client";
import { runGuestSession } from "./guest-session";

const SESSION_ID_PATTERN = /^\d{6}$/;
const CLIENT_VERSION = "0.1.0";

function isType<T extends UserMessage["type"]>(
  message: unknown,
  type: T,
): message is Extract<UserMessage, { type: T }> {
  return typeof message === "object" && message !== null && (message as { type?: unknown }).type === type;
}

export async function runJoin(sessionId: string | undefined): Promise<void> {
  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    console.error("Usage: rsynx join <session-id>\n<session-id> must be 6 digits.");
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const passphrase = await rl.question("Passphrase: ");
  rl.close();

  const key = await deriveSessionKey(sessionId, passphrase.trim());

  const events: RelayClientEvents = {};
  const client = new RelayClient(sessionId, "guest", events);

  await new Promise<void>((resolve, reject) => {
    events.onPeerJoined = async () => {
      console.log("  Connected to host. Sending join-request...");
      const envelope = await encryptMessage(key, {
        type: "join-request",
        payload: { client_version: CLIENT_VERSION },
      });
      client.sendUserEnvelope({
        level: "user",
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        ...envelope,
      });
      console.log("  Sent join-request. Waiting for the host to accept...");
    };

    events.onUserEnvelope = async (envelope) => {
      let message: unknown;
      try {
        message = await decryptMessage(key, envelope as unknown as EncryptedEnvelope);
      } catch (error) {
        if (error instanceof DecryptionError) return;
        throw error;
      }

      if (isType(message, "join-accept")) {
        console.log("  Host accepted. Starting session...");
        await runGuestSession({
          sessionId,
          key,
          client,
          events,
          initialCols: message.payload.cols,
          initialRows: message.payload.rows,
        });
        resolve();
        return;
      }

      if (isType(message, "join-reject")) {
        console.log(`  Host rejected the join request${message.payload.reason ? ` (${message.payload.reason})` : ""}.`);
        client.close();
        resolve();
      }
    };

    events.onSessionExpired = (reason) => {
      console.log(`  Session expired: ${reason}`);
      client.close();
      resolve();
    };
    events.onPeerLeft = () => {
      console.log("  Host disconnected.");
      client.close();
      resolve();
    };
    events.onClose = () => resolve();

    client
      .waitUntilOpen()
      .then(() => console.log("  Connected to relay. Waiting for the host..."))
      .catch(reject);
  });
}
