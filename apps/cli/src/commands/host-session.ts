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

const CONTROL_REVOKE_BYTE = 0x07; // Ctrl+G — docs/SPEC.md §7 default instant-revoke hotkey.

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
  let guestHasControl = false;
  let pendingControlRequest = false;

  async function sendUserMessage(message: UserMessage): Promise<void> {
    const envelope = await encryptMessage(key, message);
    client.sendUserEnvelope({
      level: "user",
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      ...envelope,
    });
  }

  function updateStatus(): void {
    const controlText = pendingControlRequest
      ? "guest requests control [Y/n]"
      : guestHasControl
        ? "guest has control (Ctrl+G to revoke)"
        : "you have control";
    tui.setStatus(
      ` rsynx host  |  session ${sessionId}  |  guest: ${guestConnected ? "connected" : "gone"}  |  ${controlText}  |  Ctrl+T chat${chat.isOpen() ? " [OPEN]" : ""}  |  Ctrl+] quit `,
    );
  }
  updateStatus();
  tui.repaint(xterm);

  function repaintChat(): void {
    tui.setChatContent(chat.renderContent(tui.chatContentHeight));
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
      await sendUserMessage({
        type: "terminal-data",
        payload: { chunk: Buffer.from(data).toString("base64") },
      });
    }
  }

  tui.onRawInput((chunk) => {
    if (pendingControlRequest) {
      pendingControlRequest = false;
      const answer = chunk[0];
      const accepted = answer !== 0x6e && answer !== 0x4e; // anything but 'n'/'N' accepts, matching join-request UX
      guestHasControl = accepted;
      updateStatus();
      if (accepted) void sendUserMessage({ type: "control-grant", payload: {} });
      return;
    }

    const result = chat.handleChunk(chunk, (text) => {
      void sendUserMessage({ type: "chat-message", payload: { text, from: "host" } });
    });
    repaintChat();

    if (result.quit) {
      terminal.close();
      shutdown();
      return;
    }

    let bytes = result.passthrough;
    if (bytes.includes(CONTROL_REVOKE_BYTE)) {
      bytes = Buffer.from([...bytes].filter((byte) => byte !== CONTROL_REVOKE_BYTE));
      if (guestHasControl) {
        guestHasControl = false;
        updateStatus();
        void sendUserMessage({ type: "control-revoke", payload: {} });
      }
    }

    if (bytes.length > 0) terminal.write(bytes);
  });

  tui.onResize((cols, rows) => {
    xterm.resize(cols, rows);
    terminal.resize(cols, rows);
    tui.repaint(xterm);
  });

  events.onPeerLeft = () => {
    guestConnected = false;
    guestHasControl = false;
    pendingControlRequest = false;
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
      return;
    }

    if (isType(message, "control-request")) {
      if (guestHasControl || pendingControlRequest) return;
      pendingControlRequest = true;
      updateStatus();
      return;
    }

    if (isType(message, "keystroke")) {
      // Independently verified here, not just trusted from the guest (docs/SPEC.md §7).
      if (!guestHasControl) return;
      terminal.write(Buffer.from(message.payload.data, "base64"));
    }
  };
  events.onSessionExpired = (reason) => {
    tui.setStatus(` Session expired: ${reason} `);
    tui.repaint(xterm);
  };
  events.onClose = () => shutdown();

  await proc.exited;
}
