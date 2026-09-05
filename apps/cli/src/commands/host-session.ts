import { Terminal } from "@xterm/headless";
import {
  DecryptionError,
  decryptMessage,
  encryptMessage,
  type EncryptedEnvelope,
  type UserMessage,
} from "@rsynx/protocol";
import { ChatController } from "../chat";
import type { RelayClient, RelayClientEvents } from "../relay-client";
import { createTui } from "../tui";

function isType<T extends UserMessage["type"]>(
  message: unknown,
  type: T,
): message is Extract<UserMessage, { type: T }> {
  return typeof message === "object" && message !== null && (message as { type?: unknown }).type === type;
}

export async function runHostSession(params: {
  sessionId: string;
  key: CryptoKey;
  client: RelayClient;
  events: RelayClientEvents;
}): Promise<void> {
  const { sessionId, key, client, events } = params;

  const tui = createTui();
  const xterm = new Terminal({ cols: tui.cols, rows: tui.rows, allowProposedApi: true });
  const chat = new ChatController();
  let guestConnected = true;

  function updateStatus(): void {
    tui.setStatus(
      ` rsynx host  |  session ${sessionId}  |  guest: ${guestConnected ? "connected" : "gone"}  |  Ctrl+T chat${chat.isOpen() ? " [OPEN]" : ""}  |  Ctrl+] quit `,
    );
  }
  updateStatus();
  tui.repaint(xterm);

  function repaintChat(): void {
    tui.setChatContent(chat.renderContent());
    if (chat.isOpen()) tui.showChat();
    else tui.hideChat();
    updateStatus();
  }

  // Serializes async output handling so terminal-data chunks reach the guest in order.
  let chain: Promise<void> = Promise.resolve();

  function shutdown(): void {
    tui.destroy();
    client.close();
    process.exit(0);
  }

  const proc = Bun.spawn([process.env.SHELL ?? "bash"], {
    terminal: {
      cols: tui.cols,
      rows: tui.rows,
      data(_term, data) {
        chain = chain.then(() => handleHostOutput(data));
      },
      exit() {
        shutdown();
      },
    },
  });

  // `terminal` is always set here — this Bun.spawn call always passes the terminal option.
  const terminal = proc.terminal!;

  async function handleHostOutput(data: Uint8Array): Promise<void> {
    await new Promise<void>((resolve) => xterm.write(data, resolve));
    tui.repaint(xterm);

    if (guestConnected) {
      const message: UserMessage = {
        type: "terminal-data",
        payload: { chunk: Buffer.from(data).toString("base64") },
      };
      const envelope = await encryptMessage(key, message);
      client.sendUserEnvelope({
        level: "user",
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        ...envelope,
      });
    }
  }

  tui.onRawInput((chunk) => {
    const result = chat.handleChunk(chunk, async (text) => {
      const message: UserMessage = { type: "chat-message", payload: { text, from: "host" } };
      const envelope = await encryptMessage(key, message);
      client.sendUserEnvelope({
        level: "user",
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        ...envelope,
      });
    });
    repaintChat();

    if (result.quit) {
      terminal.close();
      shutdown();
      return;
    }

    if (result.passthrough.length > 0) terminal.write(result.passthrough);
  });

  tui.onResize((cols, rows) => {
    xterm.resize(cols, rows);
    terminal.resize(cols, rows);
    tui.repaint(xterm);
  });

  events.onPeerLeft = () => {
    guestConnected = false;
    updateStatus();
  };
  events.onUserEnvelope = async (envelope) => {
    let message: unknown;
    try {
      message = await decryptMessage(key, envelope as unknown as EncryptedEnvelope);
    } catch (error) {
      if (error instanceof DecryptionError) return;
      throw error;
    }

    if (isType(message, "chat-message")) {
      chat.receiveMessage(message.payload.text);
      repaintChat();
    }
  };
  events.onSessionExpired = (reason) => {
    tui.setStatus(` Session expired: ${reason} `);
    tui.repaint(xterm);
  };
  events.onClose = () => shutdown();

  await proc.exited;
}
