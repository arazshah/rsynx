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

const CONTROL_REQUEST_BYTE = 0x12; // Ctrl+R — requests control from the host.

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
  const chat = new ChatController();
  let hostConnected = true;
  let hasControl = false;

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
    const controlText = hasControl ? "you have control" : "Ctrl+R request control";
    tui.setStatus(
      ` rsynx guest  |  session ${sessionId}  |  host: ${hostConnected ? "connected" : "gone"}  |  ${controlText}  |  Ctrl+T chat${chat.isOpen() ? " [OPEN]" : ""}  |  Ctrl+] quit `,
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

  function shutdown(): void {
    tui.destroy();
    client.close();
    process.exit(0);
  }

  events.onPeerLeft = () => {
    hostConnected = false;
    hasControl = false;
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
      return;
    }

    if (isType(message, "chat-message")) {
      chat.receiveMessage(message.payload.text);
      repaintChat();
      return;
    }

    if (isType(message, "control-grant")) {
      hasControl = true;
      updateStatus();
      return;
    }

    if (isType(message, "control-revoke")) {
      hasControl = false;
      updateStatus();
    }
  };

  tui.onRawInput((chunk) => {
    const result = chat.handleChunk(chunk, (text) => {
      void sendUserMessage({ type: "chat-message", payload: { text, from: "guest" } });
    });
    repaintChat();

    if (result.quit) {
      shutdown();
      return;
    }

    if (result.passthrough.length === 0) return;

    if (!hasControl) {
      if (result.passthrough.includes(CONTROL_REQUEST_BYTE)) {
        void sendUserMessage({ type: "control-request", payload: {} });
      }
      return;
    }

    const bytes = result.passthrough.includes(CONTROL_REQUEST_BYTE)
      ? Buffer.from([...result.passthrough].filter((byte) => byte !== CONTROL_REQUEST_BYTE))
      : result.passthrough;
    if (bytes.length > 0) {
      void sendUserMessage({ type: "keystroke", payload: { data: bytes.toString("base64") } });
    }
  });

  await new Promise<void>((resolve) => {
    events.onClose = () => {
      shutdown();
      resolve();
    };
  });
}
