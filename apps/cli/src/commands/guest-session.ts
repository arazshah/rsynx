import { Terminal } from "@xterm/headless";
import { DecryptionError, decryptMessage, type EncryptedEnvelope, type UserMessage } from "@rsynx/protocol";
import type { RelayClient, RelayClientEvents } from "../relay-client";
import { createTui } from "../tui";

function isType<T extends UserMessage["type"]>(
  message: unknown,
  type: T,
): message is Extract<UserMessage, { type: T }> {
  return typeof message === "object" && message !== null && (message as { type?: unknown }).type === type;
}

export async function runGuestSession(params: {
  sessionId: string;
  key: CryptoKey;
  client: RelayClient;
  events: RelayClientEvents;
  initialCols: number;
  initialRows: number;
}): Promise<void> {
  const { sessionId, key, client, events, initialCols, initialRows } = params;

  const tui = createTui();
  const xterm = new Terminal({ cols: initialCols, rows: initialRows, allowProposedApi: true });
  let hostConnected = true;

  function updateStatus(): void {
    tui.setStatus(
      ` rsynx guest  |  session ${sessionId}  |  host: ${hostConnected ? "connected" : "gone"}  |  Ctrl+] quit `,
    );
  }
  updateStatus();
  tui.repaint(xterm);

  function shutdown(): void {
    tui.destroy();
    client.close();
    process.exit(0);
  }

  events.onPeerLeft = () => {
    hostConnected = false;
    updateStatus();
  };
  events.onSessionExpired = (reason) => {
    tui.setStatus(` Session expired: ${reason} `);
    tui.repaint(xterm);
  };
  events.onClose = shutdown;
  events.onUserEnvelope = async (envelope) => {
    let message: unknown;
    try {
      message = await decryptMessage(key, envelope as unknown as EncryptedEnvelope);
    } catch (error) {
      if (error instanceof DecryptionError) return;
      throw error;
    }

    if (isType(message, "terminal-data")) {
      const data = Buffer.from(message.payload.chunk, "base64");
      await new Promise<void>((resolve) => xterm.write(data, resolve));
      tui.repaint(xterm);
      return;
    }

    if (isType(message, "terminal-resize")) {
      xterm.resize(message.payload.cols, message.payload.rows);
      tui.repaint(xterm);
      return;
    }

    if (isType(message, "session-end")) {
      tui.setStatus(" Session ended by host ");
      tui.repaint(xterm);
    }
  };

  // Guest keystrokes are not forwarded to the host yet — control transfer lands in 7.7.
  tui.onRawInput(() => {});

  await new Promise<void>((resolve) => {
    events.onClose = () => {
      shutdown();
      resolve();
    };
  });
}
