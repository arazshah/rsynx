import { generatePassphrase, generateSessionId } from "@rsynx/protocol";
import { RelayClient } from "../relay-client";

const BOLD = "\x1b[1m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

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

  await new Promise<void>((resolve, reject) => {
    const client = new RelayClient(sessionId, "host", {
      onPeerJoined: (role) => {
        console.log(`  Guest connected (role: ${role}). Waiting for join-request... (not implemented yet)`);
        client.close();
        resolve();
      },
      onSessionExpired: (reason) => {
        console.log(`  Session expired: ${reason}`);
        client.close();
        resolve();
      },
      onClose: () => resolve(),
    });

    client
      .waitUntilOpen()
      .then(() => console.log("  Connected to relay. Waiting for a guest to join..."))
      .catch(reject);
  });
}
