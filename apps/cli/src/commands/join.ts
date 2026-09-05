import * as readline from "node:readline/promises";
import { deriveSessionKey, encryptMessage } from "@rsynx/protocol";
import { RelayClient } from "../relay-client";

const SESSION_ID_PATTERN = /^\d{6}$/;
const CLIENT_VERSION = "0.1.0";

export async function runJoin(sessionId: string | undefined): Promise<void> {
  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    console.error("Usage: rsynx join <session-id>\n<session-id> must be 6 digits.");
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const passphrase = await rl.question("Passphrase: ");
  rl.close();

  const key = await deriveSessionKey(sessionId, passphrase.trim());

  await new Promise<void>((resolve, reject) => {
    const client = new RelayClient(sessionId, "guest", {
      onPeerJoined: async () => {
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
        console.log("  Sent join-request. Waiting for the host to accept... (not implemented yet)");
      },
      onSessionExpired: (reason) => {
        console.log(`  Session expired: ${reason}`);
        client.close();
        resolve();
      },
      onPeerLeft: () => {
        console.log("  Host disconnected.");
        client.close();
        resolve();
      },
      onClose: () => resolve(),
    });

    client
      .waitUntilOpen()
      .then(() => console.log("  Connected to relay. Waiting for the host..."))
      .catch(reject);
  });
}
